// Builds assets/ink/motion/ from the pinned Paper Shaders package and
// scripts/motion/shaders.json. Run through scripts/build-motion.
//
//   node scripts/motion/build.mjs [--out DIR] [--check]
//
// Steps: npm pack the pinned version and verify its sha512; check that every
// curated shader, enum table and color limit in shaders.json matches the
// package; patch ShaderMount so it injects no <style> (assets/ink/motion.css
// carries those rules); bundle core.js, noise.js and one module per shader
// with the pinned esbuild; copy Paper's LICENSE and NOTICE. --check builds
// into a temp dir and fails when the committed bundle differs.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '..', '..');
const args = process.argv.slice(2);
const check = args.includes('--check');
const outArg = args.includes('--out') ? args[args.indexOf('--out') + 1] : null;
const target = resolve(outArg ?? join(repo, 'assets', 'ink', 'motion'));
const spec = JSON.parse(readFileSync(join(here, 'shaders.json'), 'utf8'));
const CORE_GZIP_LIMIT = 15 * 1024;
const SHADER_GZIP_LIMIT = 6 * 1024;

const fail = (message) => { console.error(`build-motion: ${message}`); process.exit(1); };
const work = mkdtempSync(join(tmpdir(), 'ink-motion-'));
process.on('exit', () => rmSync(work, { recursive: true, force: true }));

// 1. The pinned package, verified.
const { package: pkg, version, integrity } = spec.paper;
execFileSync('npm', ['pack', `${pkg}@${version}`, '--pack-destination', work, '--silent'], { stdio: ['ignore', 'ignore', 'inherit'] });
const tgz = readdirSync(work).find((f) => f.endsWith('.tgz'));
if (!tgz) fail('npm pack produced no tarball');
const digest = `sha512-${createHash('sha512').update(readFileSync(join(work, tgz))).digest('base64')}`;
if (digest !== integrity) fail(`${pkg}@${version} integrity ${digest} does not match the pinned ${integrity}`);
execFileSync('tar', ['-xzf', join(work, tgz), '-C', work]);
const paper = join(work, 'package');

// 2. shaders.json against the package.
const index = await import(pathToFileURL(join(paper, 'dist', 'index.js')).href);
const tables = Object.fromEntries(Object.entries(index).filter(([, v]) => v && typeof v === 'object'));
for (const [name, s] of Object.entries(spec.shaders)) {
  const file = join(paper, 'dist', 'shaders', `${name}.js`);
  if (!existsSync(file)) fail(`${name}: no dist/shaders/${name}.js in ${pkg}@${version}`);
  const fragment = index[s.fragment];
  if (typeof fragment !== 'string') fail(`${name}: ${s.fragment} is not exported`);
  const uses = (u) => new RegExp(`\\b${u}\\b`).test(fragment);
  if (Boolean(s.noise) !== uses('u_noiseTexture')) fail(`${name}: "noise" must be ${uses('u_noiseTexture')}`);
  if (Boolean(s.image) !== uses('u_image')) fail(`${name}: "image" must be set exactly when the shader samples u_image`);
  if (Boolean(s.animated) !== uses('u_time')) fail(`${name}: "animated" must be ${uses('u_time')}`);
  for (const [param, p] of Object.entries(s.params)) {
    const uniform = p.uniform ?? `u_${param}`;
    if (!uses(uniform)) fail(`${name}: param ${param} maps to ${uniform}, which the shader does not declare`);
    if (p.type === 'enum' && JSON.stringify(tables[p.table]) !== JSON.stringify(p.values)) fail(`${name}: ${param} values differ from ${p.table} ${JSON.stringify(tables[p.table])}`);
  }
  for (const [color, c] of Object.entries(s.colors)) {
    if (c.list) {
      if (!uses('u_colors') || tables[c.meta]?.maxColorCount !== c.max) fail(`${name}: colors max must be ${tables[c.meta]?.maxColorCount}`);
    } else if (!uses(`u_${color}`)) {
      fail(`${name}: color ${color} is not a uniform of the shader`);
    }
  }
}

// 3. ShaderMount without its injected <style>: motion.css has those rules, so
// the engine needs no inline styles (stricter CSPs stay happy).
const mountFile = join(paper, 'dist', 'shader-mount.js');
const mountSource = readFileSync(mountFile, 'utf8');
const styleGuard = 'if (!this.ownerDocument.querySelector("style[data-paper-shader]")) {';
if (mountSource.split(styleGuard).length !== 2) fail('shader-mount.js changed: the <style> injection patch no longer applies');
writeFileSync(mountFile, mountSource.replace(styleGuard, 'if (false) {'));

// 4. Entry points.
const src = join(work, 'src');
mkdirSync(join(src, 'shaders'), { recursive: true });
cpSync(join(paper, 'dist'), join(src, 'paper'), { recursive: true });
cpSync(join(here, 'src', 'core.js'), join(src, 'core.js'));
writeFileSync(join(src, 'noise.js'), "export { getShaderNoiseTexture } from './paper/get-shader-noise-texture.js';\n");
const names = Object.keys(spec.shaders).sort();
for (const name of names) {
  const s = spec.shaders[name];
  const sizing = { ...spec.sizing_defaults[s.sizing], ...(s.sizing_overrides ?? {}) };
  const params = {};
  const defaults = {};
  for (const [param, p] of Object.entries(s.params)) {
    params[param] = { type: p.type, uniform: p.uniform ?? `u_${param}`, ...(p.type === 'enum' ? { values: p.values } : {}), ...(p.type === 'number' ? { min: p.min, max: p.max } : {}) };
    defaults[param] = p.default;
  }
  const colors = Object.fromEntries(Object.entries(s.colors).map(([k, c]) => [k, c.list ? { list: true, max: c.max, default: c.default } : { default: c.default }]));
  const runtime = {
    animated: s.animated, noise: Boolean(s.noise), image: s.image ?? false, mipmaps: s.mipmaps ?? [],
    isImageFlag: /\bu_isImage\b/.test(index[s.fragment]), sizing, params, defaults, colors,
  };
  const lines = [`import { ${s.fragment} as fragment } from '../paper/shaders/${name}.js';`];
  if (s.image === 'optional') lines.push("import { emptyPixel as empty } from '../paper/empty-pixel.js';");
  lines.push(`export default { fragment, spec: ${JSON.stringify(runtime)}${s.image === 'optional' ? ', empty' : ''} };`);
  writeFileSync(join(src, 'shaders', `${name}.js`), lines.join('\n') + '\n');
}
const sizingParams = Object.fromEntries(Object.entries(spec.sizing).map(([k, p]) => [k, { type: p.type, uniform: p.uniform, ...(p.values ? { values: p.values } : {}), ...(p.type === 'number' ? { min: p.min, max: p.max } : {}) }]));

// 5. Bundle.
const out = join(work, 'out');
const banner = `/* InkDrafts ink motion engine. Bundles ${pkg} ${version} (Apache-2.0, https://shaders.paper.design), modified: ShaderMount injects no <style>. See LICENSE and NOTICE. */`;
execFileSync('npx', ['--yes', `esbuild@${spec.esbuild}`,
  'core.js', 'noise.js', ...names.map((n) => `shaders/${n}.js`),
  '--bundle', '--format=esm', '--minify', '--target=es2020', '--charset=utf8', '--legal-comments=none',
  `--outdir=${out}`, `--banner:js=${banner}`,
  `--define:__INK_SHADERS__=${JSON.stringify(names)}`,
  `--define:__INK_SIZING__=${JSON.stringify(sizingParams)}`,
  `--define:__INK_LIMITS__=${JSON.stringify({ speed: [spec.motion.speed.min, spec.motion.speed.max], frame: [spec.motion.frame.min, spec.motion.frame.max] })}`,
  '--log-level=warning',
], { cwd: src, stdio: ['ignore', 'inherit', 'inherit'] });
cpSync(join(paper, 'LICENSE'), join(out, 'LICENSE'));
writeFileSync(join(out, 'NOTICE'), `${readFileSync(join(paper, 'NOTICE'), 'utf8').trimEnd()}\n\n` +
  `Bundled in InkDrafts as assets/ink/motion/ by scripts/build-motion from\n${pkg}@${version}.\n` +
  'Modified: ShaderMount no longer injects a <style> element; the same rules\nship in assets/ink/motion.css.\n');

// 6. Budgets and the report.
const rows = [];
const walk = (dir) => readdirSync(dir).flatMap((f) => statSync(join(dir, f)).isDirectory() ? walk(join(dir, f)) : [join(dir, f)]);
for (const file of walk(out).filter((f) => f.endsWith('.js')).sort()) {
  const body = readFileSync(file);
  const gz = gzipSync(body, { level: 9 }).length;
  const rel = file.slice(out.length + 1);
  rows.push(`${rel.padEnd(32)} ${String(body.length).padStart(7)} B  ${String(gz).padStart(6)} B gzip`);
  if (rel === 'core.js' && gz > CORE_GZIP_LIMIT) fail(`core.js is ${gz} B gzip, over the ${CORE_GZIP_LIMIT} B budget`);
  if (rel.startsWith('shaders/') && gz > SHADER_GZIP_LIMIT) fail(`${rel} is ${gz} B gzip, over the ${SHADER_GZIP_LIMIT} B budget`);
}

if (check) {
  const diff = (a, b) => {
    const fa = existsSync(a) ? walk(a).map((f) => f.slice(a.length + 1)).sort() : [];
    const fb = walk(b).map((f) => f.slice(b.length + 1)).sort();
    if (JSON.stringify(fa) !== JSON.stringify(fb)) return `file list differs: ${fa.join(' ')} vs ${fb.join(' ')}`;
    return fa.find((f) => !readFileSync(join(a, f)).equals(readFileSync(join(b, f))));
  };
  const different = diff(target, out);
  if (different) fail(`${target} is out of date (${different}); run scripts/build-motion`);
  console.log(`build-motion: ${target} matches a fresh build`);
} else {
  rmSync(target, { recursive: true, force: true });
  mkdirSync(target, { recursive: true });
  cpSync(out, target, { recursive: true });
  console.log(rows.join('\n'));
  console.log(`build-motion: wrote ${target}`);
}
