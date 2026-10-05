// Checks which home scene the page shows, and the live switch between scenes.
//
// The home page draws one of the registered scenes (scenes/<name>.js, each a descriptor mounted by the shell in
// scenes/kit.js) behind its two objects. The logic class keeps a registry, `scenes`, and picks one per page load:
// ?scene=<name> when that name is registered, otherwise one at random. Leaving home destroys the scene; coming back
// must bring back the same one, not deal a new one. The dev panel's switcher calls switchScene(name), which must
// destroy the mounted scene before the named one mounts, or two canvases (and two frame loops) stand in the layer.
//
// The registry, the pick and the mount path are read out of the logic class and run against a stub `this`, with the
// scene loader stubbed, so nothing here needs a browser.
//
// Run with `npm run check`. HOME_SRC=<path> runs it against another copy of the logic. Exits non-zero on any failure.
import { readFileSync } from 'node:fs';

const SRC = process.env.HOME_SRC || 'design/Portfolio.dc.html';
const src = readFileSync(SRC, 'utf8').replace(/\r\n/g, '\n');
const failures = [];
const fail = (msg) => failures.push(msg);
const done = () => {
  if (failures.length) {
    console.error('check-scene-pick: ' + failures.length + ' failure' + (failures.length === 1 ? '' : 's') + ' in ' + SRC);
    for (const f of failures) console.error('  - ' + f);
    process.exit(1);
  }
  console.log('check-scene-pick: ?scene= picks a registered scene, an unknown name falls back to one, the pick holds across leaving home, and a switch destroys before it mounts');
};

// every member of the logic class sits at two-space indent, so `\n  }` closes it
function member(head) {
  const at = src.indexOf('\n  ' + head);
  if (at < 0) return null;
  const open = src.indexOf('{', at), end = src.indexOf('\n  }', open);
  return open < 0 || end < 0 ? null : src.slice(open, end + 4);
}
const method = (name) => { const m = member(name + '('); return m && m.slice(1, -3); };
const params = (name) => { const at = src.indexOf('\n  ' + name + '('); return src.slice(src.indexOf('(', at) + 1, src.indexOf(')', at)); };

const registryText = member('scenes = {');
const pickBody = method('pickScene'), syncBody = method('syncScene'), switchBody = method('switchScene');
if (!registryText) fail('the logic class has no scene registry (a `scenes = { name: () => import(...) }` field)');
if (!pickBody) fail('the logic class has no pickScene(search, random), so nothing picks the home scene');
if (!syncBody) fail('the logic class has no syncScene(), so nothing mounts the home scene');
if (!switchBody) fail('the logic class has no switchScene(name), so the dev panel cannot switch scenes');
if (!/\n {2}sceneName = this\.pickScene\(location\.search\);/.test(src)) fail('the scene should be picked once per page load, as a field: `sceneName = this.pickScene(location.search);`');
if (failures.length) done();

const registry = new Function('return ' + registryText)();
const pickScene = new Function(...params('pickScene').split(',').map((s) => s.trim()), pickBody);
const syncScene = new Function(syncBody), switchScene = new Function('name', switchBody);

// (a) the real registry holds the pond, and ?scene=pond picks it
{
  const self = { scenes: registry };
  if (typeof registry.pond !== 'function') fail('(a) the registry should hold the pond as a lazy import');
  const got = pickScene.call(self, '?scene=pond', () => 0.999);
  if (got !== 'pond') fail(`(a) ?scene=pond should pick the pond, picked ${got}`);
}

// a registry of three stand-in scenes, so a random pick and a switch have somewhere to go
const fake = { pond: () => null, prairie: () => null, mountain: () => null }, names = Object.keys(fake);

// (b) a registered name wins over the dice; an unknown or missing name falls back to a registered one, and every
// registered scene can come up
{
  const self = { scenes: fake };
  if (pickScene.call(self, '?scene=mountain', () => 0) !== 'mountain') fail('(b) ?scene=mountain should pick mountain when it is registered');
  const seen = new Set();
  for (const search of ['?scene=lake', '', '?dev', '?scene=']) for (const r of [0, 0.34, 0.67, 0.999]) {
    const got = pickScene.call(self, search, () => r);
    if (!names.includes(got)) fail(`(b) ${JSON.stringify(search)} with random ${r} should fall back to a registered scene, picked ${got}`);
    seen.add(got);
  }
  if (seen.size !== names.length) fail(`(b) the random pick should reach every registered scene, reached ${[...seen].join(', ')}`);
}

// a stub page: the layer, the two home buttons, a scene loader that records what it mounts and what it destroys
const el = () => ({ style: {}, firstElementChild: null, getBoundingClientRect: () => ({ left: 100, top: 100, width: 200, height: 120 }) });
function page(search, dice) {
  const log = [];
  let n = 0;
  const self = {
    state: { view: 'home' }, scenes: fake,
    sceneLayerRef: { current: el() }, homeRollRef: { current: el() }, homeCubeRef: { current: el() },
    homeHoverAt() {},
    loadScene: (name) => Promise.resolve([{
      mountScene: (layer, scene, host) => {
        const id = ++n; log.push(['mount', host.name, id]);
        if (!host.scenes || !host.scenes.includes(host.name) || typeof host.pick !== 'function') log.push(['bad host', JSON.stringify(Object.keys(host))]);
        return { setOutlines() {}, setSources() {}, destroy: () => log.push(['destroy', host.name, id]) };
      },
    }, { scene: { name } }]),
  };
  self.pickScene = (s, r) => pickScene.call(self, s, r);
  self.sceneName = self.pickScene(search, dice);   // the field initialiser, once per page load
  self.syncScene = () => syncScene.call(self);
  self.switchScene = (name) => switchScene.call(self, name);
  return { self, log };
}
const settle = () => new Promise((r) => setImmediate(r));
// the kill timer on leaving home fires at once here
globalThis.setTimeout = (fn) => { fn(); return 0; };
globalThis.clearTimeout = () => {};

// (c) the pick is kept: home, away (the scene is destroyed), home again mounts the same scene, though the dice would
// now say otherwise
{
  let r = 0;
  const { self, log } = page('', () => [0, 0.5, 0.9][r++ % 3]);
  self.syncScene(); await settle();
  const first = log.find((e) => e[0] === 'mount');
  if (!first) fail('(c) on home the scene should mount');
  self.state.view = 'writing'; self.syncScene(); await settle();
  if (!log.some((e) => e[0] === 'destroy')) fail('(c) leaving home should destroy the scene');
  self.state.view = 'home'; self.syncScene(); await settle();
  const mounts = log.filter((e) => e[0] === 'mount');
  if (mounts.length !== 2) fail(`(c) coming back home should mount the scene once more, mounted ${mounts.length} times in all`);
  else if (mounts[1][1] !== mounts[0][1]) fail(`(c) coming back home should bring back ${mounts[0][1]}, brought ${mounts[1][1]}`);
  for (const e of log) if (e[0] === 'bad host') fail('(c) the scene should be mounted with the host { name, scenes, pick }, got ' + e[1]);
}

// (d) the live switch destroys the mounted scene before it mounts the named one; an unregistered name changes nothing
{
  const { self, log } = page('?scene=pond');
  self.syncScene(); await settle();
  self.switchScene('mountain'); await settle();
  const after = log.slice(1).map((e) => e.slice(0, 2).join(' '));
  if (after.join(', ') !== 'destroy pond, mount mountain') fail(`(d) switching to mountain should destroy the pond and then mount mountain, did: ${after.join(', ') || 'nothing'}`);
  if (self.sceneName !== 'mountain') fail(`(d) after the switch the page should hold mountain as its scene, holds ${self.sceneName}`);
  const before = log.length;
  self.switchScene('lake'); await settle();
  if (log.length !== before) fail('(d) switching to an unregistered scene should change nothing');
  // a switch while away from home destroys the scene and mounts nothing until home
  self.state.view = 'writing'; self.switchScene('prairie'); await settle();
  if (log.some((e) => e[0] === 'mount' && e[1] === 'prairie')) fail('(d) a switch away from home should not mount a scene');
  self.state.view = 'home'; self.syncScene(); await settle();
  if (!log.some((e) => e[0] === 'mount' && e[1] === 'prairie')) fail('(d) back home after a switch, the switched-to scene should mount');
}

done();
