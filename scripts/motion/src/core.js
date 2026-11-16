// InkDrafts ink motion engine: runs a theme's manifest `motion` block on the
// surfaces `_includes/ink/motion.html` renders. Source of
// assets/ink/motion/core.js; rebuild with scripts/build-motion. Contract:
// docs/themes/motion.md.
//
// - Loaded as a module script, so it never blocks rendering. The surface's
//   box and fallback background come from CSS; the canvas fades in on top.
// - <html data-ink-motion>: "on" animates, "still" draws one frame, "off"
//   removes the canvas and never downloads a shader. prefers-reduced-motion
//   turns "on" into "still".
// - Colors are CSS custom property names resolved on the surface, and number
//   params may be custom property names too, so tweaks, dark mode and the
//   preview customizer recolor the shader without a reload.
// - Paper's ShaderMount pauses while the tab is hidden or the surface is off
//   screen; this file caps the pixel ratio, the pixel count and the frame rate.
// - No WebGL, a shader that fails to compile, or a lost context: the canvas
//   goes and the CSS fallback stays. Forced colors (high contrast) is "off".
// - Every number is clamped to Paper's range from shaders.json, so a custom
//   property or tweak can never push a shader past what the validator allows.
import { ShaderMount } from './paper/shader-mount.js';

const SHADERS = __INK_SHADERS__;
const SIZING = __INK_SIZING__;
const LIMITS = __INK_LIMITS__;
const MAX_SURFACES = 3;
const DPR_CAP = 1.5;
const MAX_PIXELS = 1600 * 1000;
const FRAME_MS = 1000 / 30;

const doc = document;
const root = doc.documentElement;
const reduce = matchMedia('(prefers-reduced-motion: reduce)');
const dark = matchMedia('(prefers-color-scheme: dark)');
const forced = matchMedia('(forced-colors: active)');
const base = import.meta.url;

function wanted() {
  const v = forced.matches ? 'off' : root.getAttribute('data-ink-motion');
  const s = v === 'off' || v === 'still' ? v : 'on';
  return s === 'on' && reduce.matches ? 'still' : s;
}

// onload, not decode(): decode() waits for a rendering opportunity, which
// headless screenshots under a virtual time budget never give it.
function loaded(img) {
  return new Promise((resolve, reject) => {
    if (img.complete && img.naturalWidth) return resolve(img);
    img.onload = () => resolve(img);
    img.onerror = reject;
  });
}

function loadImage(src) {
  const img = new Image();
  if (new URL(src, doc.baseURI).origin !== location.origin) img.crossOrigin = 'anonymous';
  img.src = src;
  return loaded(img);
}

let noise = null;
function noiseImage() {
  noise = noise || import(new URL('./noise.js', base).href).then((m) => loaded(m.getShaderNoiseTexture()));
  return noise;
}

// One 1x1 canvas turns any computed CSS color (rgb, oklch, color-mix...)
// into the 0..1 RGBA that the shaders take.
let swatch = null;
function rgba(css) {
  if (!swatch) {
    const c = doc.createElement('canvas');
    c.width = c.height = 1;
    swatch = c.getContext('2d', { willReadFrequently: true });
  }
  swatch.clearRect(0, 0, 1, 1);
  swatch.fillStyle = 'rgba(0,0,0,0)';
  swatch.fillStyle = css;
  swatch.fillRect(0, 0, 1, 1);
  const d = swatch.getImageData(0, 0, 1, 1).data;
  return [d[0] / 255, d[1] / 255, d[2] / 255, d[3] / 255];
}

const isVar = (v) => typeof v === 'string' && v.startsWith('--');
const own = (o, k) => o != null && Object.prototype.hasOwnProperty.call(o, k);
const clamp = (n, [lo, hi]) => Math.min(hi, Math.max(lo, n));

function parse(el) {
  try {
    const c = JSON.parse(el.getAttribute('data-ink-motion-config'));
    return c && typeof c === 'object' ? c : {};
  } catch (e) {
    return {};
  }
}

class Surface {
  constructor(el) {
    this.el = el;
    this.config = parse(el);
    this.mount = null;
    this.module = null;
    this.failed = !SHADERS.includes(this.config.shader);
    this.queue = Promise.resolve();
    this.probe = null;
  }

  sync() {
    this.queue = this.queue.then(() => this.apply()).catch(() => this.fail());
    return this.queue;
  }

  async apply() {
    const state = this.failed ? 'off' : wanted();
    if (state === 'off') {
      this.stop();
      this.el.setAttribute('data-ink-motion-state', this.failed ? 'failed' : 'off');
      return;
    }
    if (!this.mount) await this.start();
    if (!this.mount) return;
    const animated = this.module.spec.animated;
    this.mount.setUniforms(this.uniforms());
    const speed = state === 'on' && animated ? clamp(this.number(this.config.speed, 0.2), LIMITS.speed) : 0;
    this.mount.setSpeed(speed);
    if (speed === 0) this.mount.setFrame(this.frame());
    this.el.setAttribute('data-ink-motion-state', speed ? 'on' : 'still');
  }

  async start() {
    const config = this.config;
    this.module = this.module || (await import(new URL(`./shaders/${config.shader}.js`, base).href)).default;
    const spec = this.module.spec;
    const textures = {};
    if (spec.noise) textures.u_noiseTexture = await noiseImage();
    if (spec.image) {
      const src = this.el.getAttribute('data-ink-motion-image');
      if (src) textures.u_image = await loadImage(src);
      else if (spec.image === 'optional') textures.u_image = await loadImage(this.module.empty);
      else throw new Error('no image');
      if (spec.isImageFlag) textures.u_isImage = Boolean(src);
    }
    if (wanted() === 'off' || this.mount) return;
    const box = this.el.getBoundingClientRect();
    try {
      this.mount = new ShaderMount(this.el, this.module.fragment, { ...this.uniforms(), ...textures },
        { powerPreference: 'low-power' }, 0, this.frame(), 1, this.budget(box), spec.mipmaps || []);
    } catch (error) {
      this.el.querySelectorAll('canvas').forEach((c) => c.remove());
      throw error;
    }
    if (this.mount.program === null) throw new Error('shader did not compile');
    const mount = this.mount;
    // Slow, quiet motion needs no more than 30 frames a second.
    mount.requestRender = () => {
      if (mount.rafId !== null) cancelAnimationFrame(mount.rafId);
      const tick = (t) => {
        if (t - mount.lastRenderTime < FRAME_MS - 2) mount.rafId = requestAnimationFrame(tick);
        else mount.render(t);
      };
      mount.rafId = requestAnimationFrame(tick);
    };
    mount.canvasElement.setAttribute('aria-hidden', 'true');
    mount.canvasElement.addEventListener('webglcontextlost', () => { if (this.mount === mount) this.fail(); });
    this.resize = new ResizeObserver(() => {
      if (this.mount === mount) mount.setMaxPixelCount(this.budget(this.el.getBoundingClientRect()));
    });
    this.resize.observe(this.el);
    // Style the canvas once at opacity 0, so setting ready fades it in.
    getComputedStyle(mount.canvasElement).opacity;
    this.el.setAttribute('data-ink-motion-ready', '');
  }

  budget(box) {
    return Math.max(1, Math.min(MAX_PIXELS, Math.round(box.width * box.height * DPR_CAP * DPR_CAP)));
  }

  stop() {
    this.el.removeAttribute('data-ink-motion-ready');
    if (this.resize) this.resize.disconnect();
    this.resize = null;
    const mount = this.mount;
    this.mount = null;
    if (mount) mount.dispose();
  }

  fail() {
    this.failed = true;
    try { this.stop(); } catch (e) { this.el.querySelectorAll('canvas').forEach((c) => c.remove()); }
    this.el.setAttribute('data-ink-motion-state', 'failed');
  }

  frame() {
    return clamp(this.number(this.config.frame, 0), LIMITS.frame);
  }

  css(name) {
    return getComputedStyle(this.el).getPropertyValue(name).trim();
  }

  number(value, fallback) {
    const n = isVar(value) ? parseFloat(this.css(value)) : value;
    return typeof n === 'number' && Number.isFinite(n) ? n : fallback;
  }

  color(name) {
    if (!this.probe) {
      this.probe = doc.createElement('i');
      this.probe.hidden = true;
      this.el.append(this.probe);
    }
    this.probe.style.color = 'transparent';
    this.probe.style.color = `var(${name}, transparent)`;
    return rgba(getComputedStyle(this.probe).color);
  }

  uniforms() {
    const spec = this.module.spec, params = this.config.params || {}, colors = this.config.colors || {}, u = {};
    const all = { ...SIZING, ...spec.params };
    const defaults = { ...spec.sizing, ...spec.defaults };
    for (const [name, p] of Object.entries(all)) {
      let v = own(params, name) ? params[name] : defaults[name];
      if (p.type === 'enum') {
        if (isVar(v)) v = this.css(v);
        v = own(p.values, v) ? p.values[v] : p.values[defaults[name]];
      } else if (p.type === 'boolean') {
        v = Boolean(v);
      } else {
        v = clamp(this.number(v, defaults[name]), [p.min, p.max]);
      }
      u[p.uniform] = v;
    }
    for (const [name, c] of Object.entries(spec.colors)) {
      const value = (own(colors, name) && colors[name]) || c.default;
      if (c.list) {
        const list = (Array.isArray(value) ? value : [value]).slice(0, c.max);
        u.u_colors = list.map((n) => this.color(n));
        u.u_colorsCount = list.length;
      } else {
        u[`u_${name}`] = this.color(value);
      }
    }
    return u;
  }
}

const surfaces = [...doc.querySelectorAll('.ink-motion[data-ink-motion-config]')]
  .slice(0, MAX_SURFACES)
  .map((el) => new Surface(el));

let pending = false;
function update() {
  if (pending) return;
  pending = true;
  requestAnimationFrame(() => {
    pending = false;
    surfaces.forEach((s) => s.sync());
  });
}

if (surfaces.length) {
  surfaces.forEach((s) => s.sync());
  // Tweaks, the preview customizer and mode switches change <html> data-ink-*
  // attributes and the #ink-tweaks declarations; the OS can switch dark mode.
  new MutationObserver(update).observe(root, { attributes: true });
  const tweaks = doc.getElementById('ink-tweaks');
  if (tweaks) new MutationObserver(update).observe(tweaks, { childList: true, characterData: true, subtree: true });
  dark.addEventListener('change', update);
  reduce.addEventListener('change', update);
  forced.addEventListener('change', update);
}
