/* InkDrafts ink motion engine. Bundles @paper-design/shaders 0.0.82 (Apache-2.0, https://shaders.paper.design), modified: ShaderMount injects no <style>. See LICENSE and NOTICE. */
var C=Object.defineProperty;var W=(t,e,i)=>e in t?C(t,e,{enumerable:!0,configurable:!0,writable:!0,value:i}):t[e]=i;var s=(t,e,i)=>W(t,typeof e!="symbol"?e+"":e,i);var g={speed:[0,1],frame:[0,1e6]};var v=["dithering","dot-grid","fluted-glass","god-rays","grain-gradient","halftone-dots","image-dithering","mesh-gradient","neuro-noise","paper-texture","perlin-noise","simplex-noise","smoke-ring","voronoi","warp","waves"];var x={fit:{type:"enum",uniform:"u_fit",values:{none:0,contain:1,cover:2}},scale:{type:"number",uniform:"u_scale",min:.01,max:4},rotation:{type:"number",uniform:"u_rotation",min:0,max:360},offsetX:{type:"number",uniform:"u_offsetX",min:-1,max:1},offsetY:{type:"number",uniform:"u_offsetY",min:-1,max:1},originX:{type:"number",uniform:"u_originX",min:0,max:1},originY:{type:"number",uniform:"u_originY",min:0,max:1},worldWidth:{type:"number",uniform:"u_worldWidth",min:0,max:5e3},worldHeight:{type:"number",uniform:"u_worldHeight",min:0,max:5e3}};var A=`#version 300 es
precision mediump float;

layout(location = 0) in vec4 a_position;

uniform vec2 u_resolution;
uniform float u_pixelRatio;
uniform float u_imageAspectRatio;
uniform float u_originX;
uniform float u_originY;
uniform float u_worldWidth;
uniform float u_worldHeight;
uniform float u_fit;
uniform float u_scale;
uniform float u_rotation;
uniform float u_offsetX;
uniform float u_offsetY;

out vec2 v_objectUV;
out vec2 v_objectBoxSize;
out vec2 v_responsiveUV;
out vec2 v_responsiveBoxGivenSize;
out vec2 v_patternUV;
out vec2 v_patternBoxSize;
out vec2 v_imageUV;

vec3 getBoxSize(float boxRatio, vec2 givenBoxSize) {
  vec2 box = vec2(0.);
  // fit = none
  box.x = boxRatio * min(givenBoxSize.x / boxRatio, givenBoxSize.y);
  float noFitBoxWidth = box.x;
  if (u_fit == 1.) { // fit = contain
    box.x = boxRatio * min(u_resolution.x / boxRatio, u_resolution.y);
  } else if (u_fit == 2.) { // fit = cover
    box.x = boxRatio * max(u_resolution.x / boxRatio, u_resolution.y);
  }
  box.y = box.x / boxRatio;
  return vec3(box, noFitBoxWidth);
}

void main() {
  gl_Position = a_position;

  vec2 uv = gl_Position.xy * .5;
  vec2 boxOrigin = vec2(.5 - u_originX, u_originY - .5);
  vec2 givenBoxSize = vec2(u_worldWidth, u_worldHeight);
  givenBoxSize = max(givenBoxSize, vec2(1.)) * u_pixelRatio;
  float r = u_rotation * 3.14159265358979323846 / 180.;
  mat2 graphicRotation = mat2(cos(r), sin(r), -sin(r), cos(r));
  vec2 graphicOffset = vec2(-u_offsetX, u_offsetY);


  // ===================================================

  float fixedRatio = 1.;
  vec2 fixedRatioBoxGivenSize = vec2(
  (u_worldWidth == 0.) ? u_resolution.x : givenBoxSize.x,
  (u_worldHeight == 0.) ? u_resolution.y : givenBoxSize.y
  );

  v_objectBoxSize = getBoxSize(fixedRatio, fixedRatioBoxGivenSize).xy;
  vec2 objectWorldScale = u_resolution.xy / v_objectBoxSize;

  v_objectUV = uv;
  v_objectUV *= objectWorldScale;
  v_objectUV += boxOrigin * (objectWorldScale - 1.);
  v_objectUV += graphicOffset;
  v_objectUV /= u_scale;
  v_objectUV = graphicRotation * v_objectUV;

  // ===================================================

  v_responsiveBoxGivenSize = vec2(
  (u_worldWidth == 0.) ? u_resolution.x : givenBoxSize.x,
  (u_worldHeight == 0.) ? u_resolution.y : givenBoxSize.y
  );
  float responsiveRatio = v_responsiveBoxGivenSize.x / v_responsiveBoxGivenSize.y;
  vec2 responsiveBoxSize = getBoxSize(responsiveRatio, v_responsiveBoxGivenSize).xy;
  vec2 responsiveBoxScale = u_resolution.xy / responsiveBoxSize;

  #ifdef ADD_HELPERS
  v_responsiveHelperBox = uv;
  v_responsiveHelperBox *= responsiveBoxScale;
  v_responsiveHelperBox += boxOrigin * (responsiveBoxScale - 1.);
  #endif

  v_responsiveUV = uv;
  v_responsiveUV *= responsiveBoxScale;
  v_responsiveUV += boxOrigin * (responsiveBoxScale - 1.);
  v_responsiveUV += graphicOffset;
  v_responsiveUV /= u_scale;
  v_responsiveUV.x *= responsiveRatio;
  v_responsiveUV = graphicRotation * v_responsiveUV;
  v_responsiveUV.x /= responsiveRatio;

  // ===================================================

  float patternBoxRatio = givenBoxSize.x / givenBoxSize.y;
  vec2 patternBoxGivenSize = vec2(
  (u_worldWidth == 0.) ? u_resolution.x : givenBoxSize.x,
  (u_worldHeight == 0.) ? u_resolution.y : givenBoxSize.y
  );
  patternBoxRatio = patternBoxGivenSize.x / patternBoxGivenSize.y;

  vec3 boxSizeData = getBoxSize(patternBoxRatio, patternBoxGivenSize);
  v_patternBoxSize = boxSizeData.xy;
  float patternBoxNoFitBoxWidth = boxSizeData.z;
  vec2 patternBoxScale = u_resolution.xy / v_patternBoxSize;

  v_patternUV = uv;
  v_patternUV += graphicOffset / patternBoxScale;
  v_patternUV += boxOrigin;
  v_patternUV -= boxOrigin / patternBoxScale;
  v_patternUV *= u_resolution.xy;
  v_patternUV /= u_pixelRatio;
  if (u_fit > 0.) {
    v_patternUV *= (patternBoxNoFitBoxWidth / v_patternBoxSize.x);
  }
  v_patternUV /= u_scale;
  v_patternUV = graphicRotation * v_patternUV;
  v_patternUV += boxOrigin / patternBoxScale;
  v_patternUV -= boxOrigin;
  // x100 is a default multiplier between vertex and fragmant shaders
  // we use it to avoid UV presision issues
  v_patternUV *= .01;

  // ===================================================

  vec2 imageBoxSize;
  if (u_fit == 1.) { // contain
    imageBoxSize.x = min(u_resolution.x / u_imageAspectRatio, u_resolution.y) * u_imageAspectRatio;
  } else if (u_fit == 2.) { // cover
    imageBoxSize.x = max(u_resolution.x / u_imageAspectRatio, u_resolution.y) * u_imageAspectRatio;
  } else {
    imageBoxSize.x = min(10.0, 10.0 / u_imageAspectRatio * u_imageAspectRatio);
  }
  imageBoxSize.y = imageBoxSize.x / u_imageAspectRatio;
  vec2 imageBoxScale = u_resolution.xy / imageBoxSize;

  v_imageUV = uv;
  v_imageUV *= imageBoxScale;
  v_imageUV += boxOrigin * (imageBoxScale - 1.);
  v_imageUV += graphicOffset;
  v_imageUV /= u_scale;
  v_imageUV.x *= u_imageAspectRatio;
  v_imageUV = graphicRotation * v_imageUV;
  v_imageUV.x /= u_imageAspectRatio;

  v_imageUV += .5;
  v_imageUV.y = 1. - v_imageUV.y;
}`;var B=1920*1080*4,_=class{constructor(e,i,r,l,o=0,n=0,a=2,c=B,h=[]){s(this,"parentElement");s(this,"canvasElement");s(this,"gl");s(this,"program",null);s(this,"uniformLocations",{});s(this,"fragmentShader");s(this,"rafId",null);s(this,"lastRenderTime",0);s(this,"currentFrame",0);s(this,"speed",0);s(this,"currentSpeed",0);s(this,"providedUniforms");s(this,"mipmaps",[]);s(this,"hasBeenDisposed",!1);s(this,"resolutionChanged",!0);s(this,"textures",new Map);s(this,"minPixelRatio");s(this,"maxPixelCount");s(this,"isSafari",q());s(this,"uniformCache",{});s(this,"textureUnitMap",new Map);s(this,"ownerDocument");s(this,"initProgram",()=>{let e=j(this.gl,A,this.fragmentShader);e&&(this.program=e,this.gl.useProgram(e))});s(this,"setupPositionAttribute",()=>{let e=this.gl.getAttribLocation(this.program,"a_position"),i=this.gl.createBuffer();this.gl.bindBuffer(this.gl.ARRAY_BUFFER,i);let r=[-1,-1,1,-1,-1,1,-1,1,1,-1,1,1];this.gl.bufferData(this.gl.ARRAY_BUFFER,new Float32Array(r),this.gl.STATIC_DRAW),this.gl.enableVertexAttribArray(e),this.gl.vertexAttribPointer(e,2,this.gl.FLOAT,!1,0,0)});s(this,"setupUniforms",()=>{let e={u_time:this.gl.getUniformLocation(this.program,"u_time"),u_pixelRatio:this.gl.getUniformLocation(this.program,"u_pixelRatio"),u_resolution:this.gl.getUniformLocation(this.program,"u_resolution")};Object.entries(this.providedUniforms).forEach(([i,r])=>{if(e[i]=this.gl.getUniformLocation(this.program,i),r instanceof HTMLImageElement){let l=`${i}AspectRatio`;e[l]=this.gl.getUniformLocation(this.program,l)}}),this.uniformLocations=e});s(this,"renderScale",1);s(this,"parentWidth",0);s(this,"parentHeight",0);s(this,"parentDevicePixelWidth",0);s(this,"parentDevicePixelHeight",0);s(this,"devicePixelsSupported",!1);s(this,"intersectionObserver",null);s(this,"isInViewport",!0);s(this,"resizeObserver",null);s(this,"setupResizeObserver",()=>{this.resizeObserver=new ResizeObserver(([e])=>{if(e?.borderBoxSize[0]){let i=e.devicePixelContentBoxSize?.[0];i!==void 0&&(this.devicePixelsSupported=!0,this.parentDevicePixelWidth=i.inlineSize,this.parentDevicePixelHeight=i.blockSize),this.parentWidth=e.borderBoxSize[0].inlineSize,this.parentHeight=e.borderBoxSize[0].blockSize}this.handleResize()}),this.resizeObserver.observe(this.parentElement)});s(this,"setupIntersectionObserver",()=>{let e=this.ownerDocument.defaultView;e?.IntersectionObserver&&(this.intersectionObserver=new e.IntersectionObserver(([i])=>{this.isInViewport=i?.isIntersecting??!0,this.updateCurrentSpeed()}),this.intersectionObserver.observe(this.parentElement))});s(this,"handleVisualViewportChange",()=>{this.resizeObserver?.disconnect(),this.setupResizeObserver()});s(this,"handleResize",()=>{let e=0,i=0,r=Math.max(1,window.devicePixelRatio),l=visualViewport?.scale??1;if(this.devicePixelsSupported){let u=Math.max(1,this.minPixelRatio/r);e=this.parentDevicePixelWidth*u*l,i=this.parentDevicePixelHeight*u*l}else{let u=Math.max(r,this.minPixelRatio)*l;if(this.isSafari){let d=N(this.ownerDocument);u*=Math.max(1,d)}e=Math.round(this.parentWidth)*u,i=Math.round(this.parentHeight)*u}let o=Math.sqrt(this.maxPixelCount)/Math.sqrt(e*i),n=Math.min(1,o),a=Math.round(e*n),c=Math.round(i*n),h=a/Math.round(this.parentWidth);(this.canvasElement.width!==a||this.canvasElement.height!==c||this.renderScale!==h)&&(this.renderScale=h,this.canvasElement.width=a,this.canvasElement.height=c,this.resolutionChanged=!0,this.gl.viewport(0,0,this.gl.canvas.width,this.gl.canvas.height),this.render(performance.now()))});s(this,"render",e=>{if(this.hasBeenDisposed)return;if(this.program===null){console.warn("Tried to render before program or gl was initialized");return}let i=e-this.lastRenderTime;this.lastRenderTime=e,this.currentSpeed!==0&&(this.currentFrame+=i*this.currentSpeed),this.gl.clear(this.gl.COLOR_BUFFER_BIT),this.gl.uniform1f(this.uniformLocations.u_time,this.currentFrame*.001),this.resolutionChanged&&(this.gl.uniform2f(this.uniformLocations.u_resolution,this.gl.canvas.width,this.gl.canvas.height),this.gl.uniform1f(this.uniformLocations.u_pixelRatio,this.renderScale),this.resolutionChanged=!1),this.gl.drawArrays(this.gl.TRIANGLES,0,6),this.currentSpeed!==0?this.requestRender():this.rafId=null});s(this,"requestRender",()=>{this.rafId!==null&&cancelAnimationFrame(this.rafId),this.rafId=requestAnimationFrame(this.render)});s(this,"setTextureUniform",(e,i)=>{if(!i.complete||i.naturalWidth===0)throw new Error(`Paper Shaders: image for uniform ${e} must be fully loaded`);let r=this.textures.get(e);r&&this.gl.deleteTexture(r),this.textureUnitMap.has(e)||this.textureUnitMap.set(e,this.textureUnitMap.size);let l=this.textureUnitMap.get(e);this.gl.activeTexture(this.gl.TEXTURE0+l);let o=this.gl.createTexture();this.gl.bindTexture(this.gl.TEXTURE_2D,o),this.gl.texParameteri(this.gl.TEXTURE_2D,this.gl.TEXTURE_WRAP_S,this.gl.CLAMP_TO_EDGE),this.gl.texParameteri(this.gl.TEXTURE_2D,this.gl.TEXTURE_WRAP_T,this.gl.CLAMP_TO_EDGE),this.gl.texParameteri(this.gl.TEXTURE_2D,this.gl.TEXTURE_MIN_FILTER,this.gl.LINEAR),this.gl.texParameteri(this.gl.TEXTURE_2D,this.gl.TEXTURE_MAG_FILTER,this.gl.LINEAR),this.gl.texImage2D(this.gl.TEXTURE_2D,0,this.gl.RGBA,this.gl.RGBA,this.gl.UNSIGNED_BYTE,i),this.mipmaps.includes(e)&&(this.gl.generateMipmap(this.gl.TEXTURE_2D),this.gl.texParameteri(this.gl.TEXTURE_2D,this.gl.TEXTURE_MIN_FILTER,this.gl.LINEAR_MIPMAP_LINEAR));let n=this.gl.getError();if(n!==this.gl.NO_ERROR||o===null){console.error("Paper Shaders: WebGL error when uploading texture:",n);return}this.textures.set(e,o);let a=this.uniformLocations[e];if(a){this.gl.uniform1i(a,l);let c=`${e}AspectRatio`,h=this.uniformLocations[c];if(h){let u=i.naturalWidth/i.naturalHeight;this.gl.uniform1f(h,u)}}});s(this,"areUniformValuesEqual",(e,i)=>e===i?!0:Array.isArray(e)&&Array.isArray(i)&&e.length===i.length?e.every((r,l)=>this.areUniformValuesEqual(r,i[l])):!1);s(this,"setUniformValues",e=>{Object.entries(e).forEach(([i,r])=>{let l=r;if(r instanceof HTMLImageElement&&(l=`${r.src.slice(0,200)}|${r.naturalWidth}x${r.naturalHeight}`),this.areUniformValuesEqual(this.uniformCache[i],l))return;this.uniformCache[i]=l;let o=this.uniformLocations[i];if(!o){console.warn(`Uniform location for ${i} not found`);return}if(r instanceof HTMLImageElement)this.setTextureUniform(i,r);else if(Array.isArray(r)){let n=null,a=null;if(r[0]!==void 0&&Array.isArray(r[0])){let c=r[0].length;if(r.every(h=>h.length===c))n=r.flat(),a=c;else{console.warn(`All child arrays must be the same length for ${i}`);return}}else n=r,a=n.length;switch(a){case 2:this.gl.uniform2fv(o,n);break;case 3:this.gl.uniform3fv(o,n);break;case 4:this.gl.uniform4fv(o,n);break;case 9:this.gl.uniformMatrix3fv(o,!1,n);break;case 16:this.gl.uniformMatrix4fv(o,!1,n);break;default:console.warn(`Unsupported uniform array length: ${a}`)}}else typeof r=="number"?this.gl.uniform1f(o,r):typeof r=="boolean"?this.gl.uniform1i(o,r?1:0):console.warn(`Unsupported uniform type for ${i}: ${typeof r}`)})});s(this,"getCurrentFrame",()=>this.currentFrame);s(this,"setFrame",e=>{this.currentFrame=e,this.lastRenderTime=performance.now(),this.renderUnlessAnimating()});s(this,"setSpeed",(e=1)=>{this.speed=e,this.updateCurrentSpeed()});s(this,"updateCurrentSpeed",()=>{this.setCurrentSpeed(this.ownerDocument.hidden||!this.isInViewport?0:this.speed)});s(this,"setCurrentSpeed",e=>{this.currentSpeed=e,this.rafId===null&&e!==0&&(this.lastRenderTime=performance.now(),this.rafId=requestAnimationFrame(this.render)),this.rafId!==null&&e===0&&(cancelAnimationFrame(this.rafId),this.rafId=null)});s(this,"setMaxPixelCount",(e=B)=>{this.maxPixelCount=e,this.handleResize()});s(this,"setMinPixelRatio",(e=2)=>{this.minPixelRatio=e,this.handleResize()});s(this,"setUniforms",e=>{this.setUniformValues(e),this.providedUniforms={...this.providedUniforms,...e},this.renderUnlessAnimating()});s(this,"renderUnlessAnimating",()=>{this.rafId===null&&this.render(performance.now())});s(this,"handleDocumentVisibilityChange",()=>{this.updateCurrentSpeed()});s(this,"dispose",()=>{this.hasBeenDisposed=!0,this.rafId!==null&&(cancelAnimationFrame(this.rafId),this.rafId=null),this.gl&&this.program&&(this.textures.forEach(e=>{this.gl.deleteTexture(e)}),this.textures.clear(),this.gl.deleteProgram(this.program),this.program=null,this.gl.bindBuffer(this.gl.ARRAY_BUFFER,null),this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER,null),this.gl.bindRenderbuffer(this.gl.RENDERBUFFER,null),this.gl.bindFramebuffer(this.gl.FRAMEBUFFER,null),this.gl.getError()),this.gl.getExtension("WEBGL_lose_context")?.loseContext(),this.resizeObserver&&(this.resizeObserver.disconnect(),this.resizeObserver=null),this.intersectionObserver&&(this.intersectionObserver.disconnect(),this.intersectionObserver=null),visualViewport?.removeEventListener("resize",this.handleVisualViewportChange),this.ownerDocument.removeEventListener("visibilitychange",this.handleDocumentVisibilityChange),this.uniformLocations={},this.canvasElement.remove(),delete this.parentElement.paperShaderMount});if(e?.nodeType===1)this.parentElement=e;else throw new Error("Paper Shaders: parent element must be an HTMLElement");this.ownerDocument=e.ownerDocument;let u=this.ownerDocument.createElement("canvas");this.canvasElement=u,this.parentElement.prepend(u),this.fragmentShader=i,this.providedUniforms=r,this.mipmaps=h,this.currentFrame=n,this.minPixelRatio=a,this.maxPixelCount=c;let d=u.getContext("webgl2",{antialias:!1,depth:!1,stencil:!1,...l});if(!d)throw new Error("Paper Shaders: WebGL is not supported in this browser");this.gl=d,this.initProgram(),this.setupPositionAttribute(),this.setupUniforms(),this.setUniformValues(this.providedUniforms),this.setupResizeObserver(),visualViewport?.addEventListener("resize",this.handleVisualViewportChange),this.setupIntersectionObserver(),this.setSpeed(o),this.parentElement.setAttribute("data-paper-shader",""),this.parentElement.paperShaderMount=this,this.ownerDocument.addEventListener("visibilitychange",this.handleDocumentVisibilityChange)}};function y(t,e,i){let r=t.createShader(e);return r?(t.shaderSource(r,i),t.compileShader(r),t.getShaderParameter(r,t.COMPILE_STATUS)?r:(console.error("An error occurred compiling the shaders: "+t.getShaderInfoLog(r)),t.deleteShader(r),null)):null}function j(t,e,i){let r=t.getShaderPrecisionFormat(t.FRAGMENT_SHADER,t.MEDIUM_FLOAT),l=r?r.precision:null;l&&l<23&&(e=e.replace(/precision\s+(lowp|mediump)\s+float;/g,"precision highp float;"),i=i.replace(/precision\s+(lowp|mediump)\s+float/g,"precision highp float").replace(/\b(uniform|varying|attribute)\s+(lowp|mediump)\s+(\w+)/g,"$1 highp $3"));let o=y(t,t.VERTEX_SHADER,e),n=y(t,t.FRAGMENT_SHADER,i);if(!o||!n)return null;let a=t.createProgram();return a?(t.attachShader(a,o),t.attachShader(a,n),t.linkProgram(a),t.getProgramParameter(a,t.LINK_STATUS)?(t.detachShader(a,o),t.detachShader(a,n),t.deleteShader(o),t.deleteShader(n),a):(console.error("Unable to initialize the shader program: "+t.getProgramInfoLog(a)),t.deleteProgram(a),t.deleteShader(o),t.deleteShader(n),null)):null}function q(){let t=navigator.userAgent.toLowerCase();return t.includes("safari")&&!t.includes("chrome")&&!t.includes("android")}function N(t){let e=visualViewport?.scale??1,i=visualViewport?.width??window.innerWidth,r=window.innerWidth-t.documentElement.clientWidth,l=e*i+r,o=outerWidth/l,n=Math.round(100*o);return n%5===0?n/100:n===33?1/3:n===67?2/3:n===133?4/3:o}var k=v,$=x,z=g,Y=3,T=1.5,K=1600*1e3,Z=1e3/30,f=document,M=f.documentElement,L=matchMedia("(prefers-reduced-motion: reduce)"),J=matchMedia("(prefers-color-scheme: dark)"),O=matchMedia("(forced-colors: active)"),F=import.meta.url;function P(){let t=O.matches?"off":M.getAttribute("data-ink-motion"),e=t==="off"||t==="still"?t:"on";return e==="on"&&L.matches?"still":e}function D(t){return new Promise((e,i)=>{if(t.complete&&t.naturalWidth)return e(t);t.onload=()=>e(t),t.onerror=i})}function V(t){let e=new Image;return new URL(t,f.baseURI).origin!==location.origin&&(e.crossOrigin="anonymous"),e.src=t,D(e)}var b=null;function Q(){return b=b||import(new URL("./noise.js",F).href).then(t=>D(t.getShaderNoiseTexture())),b}var m=null;function ee(t){if(!m){let i=f.createElement("canvas");i.width=i.height=1,m=i.getContext("2d",{willReadFrequently:!0})}m.clearRect(0,0,1,1),m.fillStyle="rgba(0,0,0,0)",m.fillStyle=t,m.fillRect(0,0,1,1);let e=m.getImageData(0,0,1,1).data;return[e[0]/255,e[1]/255,e[2]/255,e[3]/255]}var I=t=>typeof t=="string"&&t.startsWith("--"),S=(t,e)=>t!=null&&Object.prototype.hasOwnProperty.call(t,e),R=(t,[e,i])=>Math.min(i,Math.max(e,t));function te(t){try{let e=JSON.parse(t.getAttribute("data-ink-motion-config"));return e&&typeof e=="object"?e:{}}catch{return{}}}var w=class{constructor(e){this.el=e,this.config=te(e),this.mount=null,this.module=null,this.failed=!k.includes(this.config.shader),this.queue=Promise.resolve(),this.probe=null}sync(){return this.queue=this.queue.then(()=>this.apply()).catch(()=>this.fail()),this.queue}async apply(){let e=this.failed?"off":P();if(e==="off"){this.stop(),this.el.setAttribute("data-ink-motion-state",this.failed?"failed":"off");return}if(this.mount||await this.start(),!this.mount)return;let i=this.module.spec.animated;this.mount.setUniforms(this.uniforms());let r=e==="on"&&i?R(this.number(this.config.speed,.2),z.speed):0;this.mount.setSpeed(r),r===0&&this.mount.setFrame(this.frame()),this.el.setAttribute("data-ink-motion-state",r?"on":"still")}async start(){let e=this.config;this.module=this.module||(await import(new URL(`./shaders/${e.shader}.js`,F).href)).default;let i=this.module.spec,r={};if(i.noise&&(r.u_noiseTexture=await Q()),i.image){let n=this.el.getAttribute("data-ink-motion-image");if(n)r.u_image=await V(n);else if(i.image==="optional")r.u_image=await V(this.module.empty);else throw new Error("no image");i.isImageFlag&&(r.u_isImage=!!n)}if(P()==="off"||this.mount)return;let l=this.el.getBoundingClientRect();try{this.mount=new _(this.el,this.module.fragment,{...this.uniforms(),...r},{powerPreference:"low-power"},0,this.frame(),1,this.budget(l),i.mipmaps||[])}catch(n){throw this.el.querySelectorAll("canvas").forEach(a=>a.remove()),n}if(this.mount.program===null)throw new Error("shader did not compile");let o=this.mount;o.requestRender=()=>{o.rafId!==null&&cancelAnimationFrame(o.rafId);let n=a=>{a-o.lastRenderTime<Z-2?o.rafId=requestAnimationFrame(n):o.render(a)};o.rafId=requestAnimationFrame(n)},o.canvasElement.setAttribute("aria-hidden","true"),o.canvasElement.addEventListener("webglcontextlost",()=>{this.mount===o&&this.fail()}),this.resize=new ResizeObserver(()=>{this.mount===o&&o.setMaxPixelCount(this.budget(this.el.getBoundingClientRect()))}),this.resize.observe(this.el),getComputedStyle(o.canvasElement).opacity,this.el.setAttribute("data-ink-motion-ready","")}budget(e){return Math.max(1,Math.min(K,Math.round(e.width*e.height*T*T)))}stop(){this.el.removeAttribute("data-ink-motion-ready"),this.resize&&this.resize.disconnect(),this.resize=null;let e=this.mount;this.mount=null,e&&e.dispose()}fail(){this.failed=!0;try{this.stop()}catch{this.el.querySelectorAll("canvas").forEach(i=>i.remove())}this.el.setAttribute("data-ink-motion-state","failed")}frame(){return R(this.number(this.config.frame,0),z.frame)}css(e){return getComputedStyle(this.el).getPropertyValue(e).trim()}number(e,i){let r=I(e)?parseFloat(this.css(e)):e;return typeof r=="number"&&Number.isFinite(r)?r:i}color(e){return this.probe||(this.probe=f.createElement("i"),this.probe.hidden=!0,this.el.append(this.probe)),this.probe.style.color="transparent",this.probe.style.color=`var(${e}, transparent)`,ee(getComputedStyle(this.probe).color)}uniforms(){let e=this.module.spec,i=this.config.params||{},r=this.config.colors||{},l={},o={...$,...e.params},n={...e.sizing,...e.defaults};for(let[a,c]of Object.entries(o)){let h=S(i,a)?i[a]:n[a];c.type==="enum"?(I(h)&&(h=this.css(h)),h=S(c.values,h)?c.values[h]:c.values[n[a]]):c.type==="boolean"?h=!!h:h=R(this.number(h,n[a]),[c.min,c.max]),l[c.uniform]=h}for(let[a,c]of Object.entries(e.colors)){let h=S(r,a)&&r[a]||c.default;if(c.list){let u=(Array.isArray(h)?h:[h]).slice(0,c.max);l.u_colors=u.map(d=>this.color(d)),l.u_colorsCount=u.length}else l[`u_${a}`]=this.color(h)}return l}},U=[...f.querySelectorAll(".ink-motion[data-ink-motion-config]")].slice(0,Y).map(t=>new w(t)),E=!1;function p(){E||(E=!0,requestAnimationFrame(()=>{E=!1,U.forEach(t=>t.sync())}))}if(U.length){U.forEach(e=>e.sync()),new MutationObserver(p).observe(M,{attributes:!0});let t=f.getElementById("ink-tweaks");t&&new MutationObserver(p).observe(t,{childList:!0,characterData:!0,subtree:!0}),J.addEventListener("change",p),L.addEventListener("change",p),O.addEventListener("change",p)}
