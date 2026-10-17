// Example shot script: a Karen walks up the cul-de-sac, gets reported by the HOA Dad, and settles it.
// Check timing:  node tools/director/direct.mjs tools/director/scripts/hoa-ambush.mjs --dry
// Render MP4:    node tools/director/direct.mjs tools/director/scripts/hoa-ambush.mjs
export default {
  name: 'hoa-ambush',
  map: 'culdesac',
  seed: 7,
  duration: 15,
  fps: 30,
  actors: [
    { id: 'karen', name: 'Karen', faction: 'karens', team: 0, pos: [0, 24], face: [0, 0], loadout: 'allowance' },
    { id: 'dad', name: 'HOA Dad', faction: 'hoaDads', team: 1, pos: [3, 4], face: [0, 24] },
    { id: 'maga', name: 'Trumper', faction: 'trumpers', team: 1, pos: [-9, -10], face: [0, 24] },
  ],
  cues: [
    { t: 0, camera: { follow: 'karen', back: 3.6, up: 2.0, side: 1.5, lookAt: 'dad' } },
    { t: 0, caption: 'When the HOA says your mailbox\nis 2 inches too tall', for: 4.2 },
    { t: 0.3, actor: 'karen', moveTo: [0, 15] },
    { t: 0.5, actor: 'dad', say: 'hoaDads.spotted.c.1' },
    { t: 0.8, actor: 'dad', moveTo: [2, 9] },
    { t: 2.8, actor: 'karen', say: 'karens.spotted.c.0' },
    { t: 4.6, camera: { follow: 'karen', back: 2.6, up: 1.8, side: 1.6, lookAt: 'dad' }, blend: 0.4 },
    { t: 4.9, actor: 'karen', fire: 'dad', head: true },
    { t: 5.9, actor: 'karen', say: 'karens.headshot.c.0' },
    { t: 6.6, actor: 'maga', moveTo: [-3, 2], run: true },
    { t: 6.8, camera: { fixed: [5, 2.6, 0], lookAt: 'maga' }, blend: 0.5 },
    { t: 7.1, actor: 'maga', say: 'trumpers.roundStart.c.0' },
    { t: 8.4, actor: 'karen', aim: 'maga' },
    { t: 8.5, camera: { follow: 'karen', back: 2.8, up: 1.8, side: -1.6, lookAt: 'maga' }, blend: 0.4 },
    { t: 8.9, actor: 'karen', fire: 'maga' },
    { t: 10.0, actor: 'karen', say: 'karens.double.c.0' },
    { t: 10.2, camera: { orbit: 'karen', radius: 6, height: 2.6, speed: 0.35, angle: 90 }, blend: 0.8 },
    { t: 11.8, caption: 'HOA MEETING ADJOURNED', style: 'center', for: 3.2 },
    { t: 12.4, actor: 'karen', say: 'karens.kill.c.0' },
  ],
};
