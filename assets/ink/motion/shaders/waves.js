/* InkDrafts ink motion engine. Bundles @paper-design/shaders 0.0.82 (Apache-2.0, https://shaders.paper.design), modified: ShaderMount injects no <style>. See LICENSE and NOTICE. */
var a=`
#define TWO_PI 6.28318530718
#define PI 3.14159265358979323846
`;var r=`#version 300 es
precision mediump float;

uniform vec4 u_colorFront;
uniform vec4 u_colorBack;
uniform float u_shape;
uniform float u_frequency;
uniform float u_amplitude;
uniform float u_spacing;
uniform float u_proportion;
uniform float u_softness;

in vec2 v_patternUV;

out vec4 fragColor;

${a}

void main() {
  vec2 shape_uv = v_patternUV;
  shape_uv *= 4.;

  float wave = .5 * cos(shape_uv.x * u_frequency * TWO_PI);
  float zigzag = 2. * abs(fract(shape_uv.x * u_frequency) - .5);
  float irregular = sin(shape_uv.x * .25 * u_frequency * TWO_PI) * cos(shape_uv.x * u_frequency * TWO_PI);
  float irregular2 = .75 * (sin(shape_uv.x * u_frequency * TWO_PI) + .5 * cos(shape_uv.x * .5 * u_frequency * TWO_PI));

  float offset = mix(zigzag, wave, smoothstep(0., 1., u_shape));
  offset = mix(offset, irregular, smoothstep(1., 2., u_shape));
  offset = mix(offset, irregular2, smoothstep(2., 3., u_shape));
  offset *= 2. * u_amplitude;

  float spacing = (.001 + u_spacing);
  float shape = .5 + .5 * sin((shape_uv.y + offset) * PI / spacing);

  float aa = .0001 + fwidth(shape);
  float dc = 1. - clamp(u_proportion, 0., 1.);
  float e0 = dc - u_softness - aa;
  float e1 = dc + u_softness + aa;
  float res = smoothstep(min(e0, e1), max(e0, e1), shape);

  vec3 fgColor = u_colorFront.rgb * u_colorFront.a;
  float fgOpacity = u_colorFront.a;
  vec3 bgColor = u_colorBack.rgb * u_colorBack.a;
  float bgOpacity = u_colorBack.a;

  vec3 color = fgColor * res;
  float opacity = fgOpacity * res;

  color += bgColor * (1. - opacity);
  opacity += bgOpacity * (1. - opacity);

  fragColor = vec4(color, opacity);
}
`;var y={fragment:r,spec:{animated:!1,noise:!1,image:!1,mipmaps:[],isImageFlag:!1,sizing:{fit:"none",scale:.6,rotation:0,offsetX:0,offsetY:0,originX:.5,originY:.5,worldWidth:0,worldHeight:0},params:{shape:{type:"number",uniform:"u_shape",min:0,max:3},frequency:{type:"number",uniform:"u_frequency",min:0,max:2},amplitude:{type:"number",uniform:"u_amplitude",min:0,max:1},spacing:{type:"number",uniform:"u_spacing",min:0,max:2},proportion:{type:"number",uniform:"u_proportion",min:0,max:1},softness:{type:"number",uniform:"u_softness",min:0,max:1}},defaults:{shape:0,frequency:.5,amplitude:.5,spacing:1.2,proportion:.1,softness:0},colors:{colorBack:{default:"--ink-bg"},colorFront:{default:"--ink-muted"}}}};export{y as default};
