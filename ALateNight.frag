/**
* Filename: ~/ALateNight.frag
* Author: Chris Webb
* Description: This file is the fragment shader that ray marches mugs as a showcase, textured with planar projection, reflection bounces and phong lighting. 
**/

#define MAX_STEPS 75
#define MAX_DIST 75.
#define MIN_DIST .01
#define NUMBER_OF_LIGHTS 1
#define LIGHT_RADIUS 75.
#define LIGHT_BOUNCES 1

precision highp float;
varying vec2 v_uv;

// UNIFORMS
uniform vec3 u_lightPositions[NUMBER_OF_LIGHTS];
uniform vec3 u_lightColors[NUMBER_OF_LIGHTS];

uniform int u_reflectionsEnabled;
uniform int u_shadowsEnabled;

uniform vec2 u_resolution;
uniform float u_time;
uniform float u_rotation;

uniform sampler2D u_mug1Tex;
uniform sampler2D u_mug2Tex;
uniform sampler2D u_surfaceAlbedoTex;
uniform sampler2D u_surfaceNormalTex;
uniform sampler2D u_surfaceGlossTex;

// STRUCTS
struct Material
{
    vec4 albedo;
    vec3 normal;
    float gloss;
};

struct SDFObject
{
    float dist;
    int id;
};

struct Ray
{
    vec3 startPos;
    vec3 endPos;
    vec3 dir;
    vec3 vel;
    int steps;
    Material hitMat;
};

// GENERAL FUNCTIONS
vec2 NormalizeUV(vec2 OldUV) {return ((OldUV - .5) * u_resolution) / u_resolution.y;} // normalizes to screen res.
mat2 Rotate(float angle) { return mat2(cos(angle),-sin(angle),sin(angle),cos(angle)); } // rotates the vector based on angle.
float Hash21(vec2 seed) { return fract(sin(seed.x * 1995. + seed.y * 74.) * 66547.); } // takes a vec2 and creates a random float.

vec2 Hash22(vec2 seed)
{
    // takes a vec2 and creates a random vec2.
    float noise = fract(sin(seed.x * 1995. + seed.y * 74.) * 66547.);
    return vec2(noise, Hash21(seed + noise));
}

float SmoothMin(float a, float b, float k) 
{ 
    //SDF courtesy of Inigo Quilez / https://iquilezles.org/www/articles/smin/smin.htm
    float maxK = max(k - abs(a - b), 0.0);
    return min(a, b) - (maxK / k) * (maxK / k) * (maxK / k) * k * (1.0 / 6.0); 
} 

// SDF FUNCTIONS
float SDFTorus(vec3 p, vec2 t) { return length(vec2(length(p.xz)-t.x,p.y))-t.y; } // returns sdf value of a torus given a point.
SDFObject SDFGroundPlane(vec3 pos) { return SDFObject(pos.y, 1); } // returns sdf value of a ground plane given a point, basically just uv.y.

float SDFCylinder(vec3 p, vec3 a, vec3 b, float r)
{
    //SDF courtesy of BigWings / https://www.shadertoy.com/view/wdf3zl
    vec3 ab = b-a;
    vec3 ap = p-a;
    float t = dot(ab, ap) / dot(ab, ab);
    vec3 c = a + t*ab;
    float x = length(p-c)-r;
    float y = (abs(t-.5)-.5)*length(ab);
    float e = length(max(vec2(x, y), 0.));
    float i = min(max(x, y), 0.);
    return e+i;
}

SDFObject SDFMug1(vec3 rayPos, vec3 pos)
{
    float mugHeight = 7.;
    float mugRadius = 3.;
    float mugFloorHeight = .5;
    float mugWallWidth = .25;
    float mugHandleThickness = .4;
    float mug = SDFCylinder(rayPos, pos, pos + vec3(0., mugHeight, 0.), mugRadius);
    float handle = SDFTorus(rayPos.yzx - pos.yzx + vec3(-(mugHeight * .5), 0., -(mugHeight * .5)), vec2(mugHeight * .333 , mugHandleThickness));
    mug = SmoothMin(handle, mug, 0.5);
    float bore = SDFCylinder(rayPos, pos + vec3(0., mugFloorHeight, 0.), pos + vec3(0., mugFloorHeight, 0.) + vec3(0., mugHeight, 0.), mugRadius - mugWallWidth);
    mug = max(mug, -bore);
    float mouth = SDFTorus(rayPos.xyz - pos.xyz + vec3(0., -mugHeight, 0.), vec2(mugRadius - (mugWallWidth * .5), mugWallWidth * .5));
    mug = min(mug, mouth);
    return SDFObject(mug, 2);
}

SDFObject SDFMug2(vec3 rayPos, vec3 pos)
{
    float mugHeight = 7.;
    float mugRadius = 3.;
    float mugFloorHeight = .5;
    float mugWallWidth = .25;
    float mugHandleThickness = .4;
    float mug = SDFCylinder(rayPos, pos, pos + vec3(0., mugHeight, 0.), mugRadius);
    float handle = SDFTorus(rayPos.yxz - pos.yxz + vec3(-(mugHeight * .5), 0., (mugHeight * .5)), vec2(mugHeight * .333 , mugHandleThickness));
    mug = SmoothMin(handle, mug, 0.5);
    float bore = SDFCylinder(rayPos, pos + vec3(0., mugFloorHeight, 0.), pos + vec3(0., mugFloorHeight, 0.) + vec3(0., mugHeight, 0.), mugRadius - mugWallWidth);
    mug = max(mug, -bore);
    float mouth = SDFTorus(rayPos.xyz - pos.xyz + vec3(0., -mugHeight, 0.), vec2(mugRadius - (mugWallWidth * .5), mugWallWidth * .5));
    mug = min(mug, mouth);
    return SDFObject(mug, 3);
}

SDFObject GetSceneInfo(vec3 currentPos)
{
    SDFObject closestThing = SDFObject(MAX_DIST, 0);

    SDFObject evoMug = SDFMug1(currentPos, vec3(-6.25, 0., -6.25));
    closestThing.dist = closestThing.dist < evoMug.dist ? closestThing.dist : evoMug.dist;
    closestThing.id = closestThing.dist < evoMug.dist ? closestThing.id : evoMug.id;

    SDFObject vapeMug = SDFMug2(currentPos, vec3(6.25, 0., 6.25));
    closestThing.dist = closestThing.dist < vapeMug.dist ? closestThing.dist : vapeMug.dist;
    closestThing.id = closestThing.dist < vapeMug.dist ? closestThing.id : vapeMug.id;

    SDFObject groundPlane = SDFGroundPlane(currentPos);
    closestThing.dist = closestThing.dist < groundPlane.dist ? closestThing.dist : groundPlane.dist;
    closestThing.id = closestThing.dist < groundPlane.dist ? closestThing.id : groundPlane.id;

    return closestThing;
}

vec3 GetNormal(vec3 Pos)
{
    vec2 offset = vec2(.01, .0);
    vec3 normal;
    normal.x = GetSceneInfo(Pos + offset.xyy).dist - GetSceneInfo(Pos - offset.xyy).dist;
    normal.y = GetSceneInfo(Pos + offset.yxy).dist - GetSceneInfo(Pos - offset.yxy).dist;
    normal.z = GetSceneInfo(Pos + offset.yyx).dist - GetSceneInfo(Pos - offset.yyx).dist;
    return normalize(normal);
}

Material GetPBSMaterial(vec3 IntersectPos, vec3 Normal, int ID)
{
    //Polar mapping UV was WAY easier once I learned about it. Thanks to BigWings from ShaderToy. https://www.youtube.com/watch?v=r1UOB8NVE8I.
    //I feel the need to stress that this is BASIC PBS, like, barely even PBS, just albedo and gloss...
    Material mat;

    if (ID < 1)
    {
        //Material missing...
        mat.albedo = vec4(0.);
        mat.normal = vec3(0.);
        mat.gloss = 0.;
    }
    else if (ID < 2)
    {
        mat.albedo = texture2D(u_surfaceAlbedoTex, fract(IntersectPos.xz * .05));
        mat.normal = (texture2D(u_surfaceNormalTex, fract(IntersectPos.xz * .05)).rgb * 2.) - 1.;
        mat.gloss = texture2D(u_surfaceGlossTex, fract(IntersectPos.xz * .05)).r ;
    }
    else if (ID < 3)
    {
        mat.albedo = texture2D(u_mug2Tex, vec2( atan((-6.25 - IntersectPos.z), (-6.25 - IntersectPos.x)) / (3.1415269 * 2.) + .5, 1. - (IntersectPos.y / 7.)));
        mat.normal = Normal;
        mat.gloss = .15;

    }
    else if (ID < 4)
    {
        mat.albedo = texture2D(u_mug1Tex, vec2( 1. - (atan(-(6.25 - IntersectPos.x), -(6.25 - IntersectPos.z)) / (3.14159265 * 2.) + .5), 1. - (IntersectPos.y / 7.)));
        mat.normal = Normal;
        mat.gloss = .15;
    }

    //After all of that, I hope to never do projection mapping again...
    return mat;
}

Ray MarchRay(vec3 rayPos, vec3 rayDir)
{
    Ray march;
    SDFObject closestObj;   

    march.startPos = rayPos;
    march.endPos = rayPos;
    march.dir = rayDir;
    march.vel = vec3(0.);
    march.steps = 0;

    for (int step = 0; step < MAX_STEPS; step++)
    {      
        closestObj = GetSceneInfo(march.endPos);
        march.steps = step;
        if (closestObj.dist < MIN_DIST || closestObj.dist > MAX_DIST) { break; }
        march.vel += closestObj.dist;
        march.endPos = march.startPos + (march.dir * march.vel);
    }

    march.endPos = march.startPos + (march.vel * march.dir);
    march.hitMat = GetPBSMaterial(march.endPos, GetNormal(march.endPos), closestObj.id);
    return march;
}

float SoftShadow(vec3 RayPos, vec3 RayDir)
{
    //THANK YOU SO MUCH INIGO, I WAS STUCK ON THIS FOR A WHILE UNTIL I FOUND YOUR SOLUTION.
    //https://iquilezles.org/www/articles/rmshadows/rmshadows.htm

    float distanceFromPosition = 0.;
    float distanceToSurface = 0.;
    float penumbra = 1.;

    for (int step = 0; step < MAX_STEPS; step++)
    {
        if (distanceFromPosition < MAX_DIST)
        {
            distanceToSurface = GetSceneInfo(RayPos + (RayDir * distanceFromPosition)).dist;
            if (distanceToSurface < MIN_DIST) { return 0.; }
            penumbra = min(penumbra, .5 * distanceToSurface / distanceFromPosition);
            distanceFromPosition += distanceToSurface;
        } 
    }
    return penumbra;
}

vec3 Diffuse(Ray ray)
{
    vec3 diffuseColor = vec3(0.);
    for (int i = 0; i < NUMBER_OF_LIGHTS; i++)
    {       
        vec3 lightDir = u_lightPositions[i] - ray.endPos;
        float shadowTerm = u_shadowsEnabled < 1 ? 1. : SoftShadow(ray.endPos + (ray.hitMat.normal * MIN_DIST), normalize(lightDir));
        vec3 lightCol = u_lightColors[i] * pow(clamp(1.0 - (length(lightDir) / LIGHT_RADIUS), 0.0, 1.0), 2.);  //Inverse square falloff.
        float diffTerm = max(0., dot(ray.hitMat.normal, normalize(lightDir)));
        float lightFlare = pow(max(dot(reflect(-normalize(u_lightPositions[i] - ray.startPos), ray.dir), ray.dir), 0.), 512.);
        lightFlare += pow(max(dot(reflect(-normalize(lightDir), ray.hitMat.normal), -ray.dir), 0.), 1024.);
        diffuseColor += lightCol * diffTerm * shadowTerm * ray.hitMat.albedo.rgb;
        //diffuseColor += lightFlare * u_lightColors[i] * shadowTerm;
        diffuseColor += lightFlare * shadowTerm * u_lightColors[i];
    }
    //return ray.hitMat.albedo.rgb * diffuseColor;
    return diffuseColor;
    // One day, I'll come back and add a glass that refracts...
}

void main()
{
    vec3 diffuse = vec3(0.); //Do skybox of some sort...
    vec3 specular = vec3(0.); //Do skybox of some sort...
    vec2 uv = NormalizeUV(v_uv);

    vec3 cameraPosition = vec3(0., 7.5, -25.);
    vec3 cameraDirection = normalize(vec3(uv.x, uv.y - .125, 1.));

    cameraPosition.xz *= Rotate(u_rotation);
    cameraDirection.xz *= Rotate(u_rotation);

    Ray ray = MarchRay(cameraPosition, cameraDirection);
    diffuse = Diffuse(ray); 
    if (u_reflectionsEnabled >= 1)
    {
        for (int i = 0; i < LIGHT_BOUNCES; i++)
        {
            float specGloss = ray.hitMat.gloss;
            ray.endPos += (ray.hitMat.normal * MIN_DIST);
            ray = MarchRay(ray.endPos, reflect(ray.dir, ray.hitMat.normal));
            specular += Diffuse(ray) * specGloss; 
        }
    }        
    vec3 color = diffuse + specular;
    gl_FragColor = vec4(sqrt(clamp(color, 0., 1.)), 1.); //Gamma color space, courtesy of https://www.shadertoy.com/view/4dt3zn.
}