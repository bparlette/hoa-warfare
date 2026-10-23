// Web demo -> Steam funnel (web/src/engine/funnel.js). Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Funnel, detectPortal } from '../src/engine/funnel.js';

const demo = JSON.parse(readFileSync(new URL('../../data/demo.json', import.meta.url)));
const loc = (hostname, search = '') => ({ hostname, search });

test('portal detection: itch, CrazyGames, Newgrounds, GitHub Pages, override', () => {
  assert.equal(detectPortal(loc('html-classic.itch.zone')), 'itch');
  assert.equal(detectPortal(loc('www.crazygames.com')), 'crazygames');
  assert.equal(detectPortal(loc('uploads.ungrounded.net')), 'newgrounds');
  assert.equal(detectPortal(loc('example.github.io')), 'github');
  assert.equal(detectPortal(loc('localhost')), 'local');
  assert.equal(detectPortal(loc('example.github.io', '?portal=TikTok<script>')), 'tiktokscript', 'override is sanitised');
});

test('Steam link: never the invalid placeholder; tagged with portal and placement; fallback until the app exists', () => {
  const pre = new Funnel(demo, 'itch');
  assert.equal(pre.live, demo.steamUrl !== null || demo.storeUrl !== null);
  const link = new URL(pre.steamLink('end_card'));
  assert.ok(!link.href.includes('/app/hoa-warfare'), 'non-numeric Steam app URLs 404');
  assert.equal(link.searchParams.get('utm_source'), 'itch');
  assert.equal(link.searchParams.get('utm_campaign'), 'end_card');
  const live = new Funnel({ ...demo, steamUrl: 'https://store.steampowered.com/app/1234560/' }, 'crazygames');
  assert.ok(live.steamLink('menu').startsWith('https://store.steampowered.com/app/1234560/?utm_source=crazygames'));
  assert.equal(live.ctaLabel(), '★ WISHLIST ON STEAM ($4.99)');
  // Full game live on itch.io but no Steam page yet: buttons link to the itch.io full-game page
  const itchOnly = new Funnel({ steamUrl: null, storeUrl: 'https://homebrewgametrailers.itch.io/call-of-karen-hoa-warfare-full' }, 'x');
  assert.equal(itchOnly.ctaLabel(), '★ GET THE FULL GAME ($4.99)');
  assert.ok(itchOnly.steamLink('menu').startsWith('https://homebrewgametrailers.itch.io/call-of-karen-hoa-warfare-full'));
  assert.equal(new Funnel({ steamUrl: null, storeUrl: null }, 'x').ctaLabel(), '★ COMING SOON TO STEAM', 'no fake wishlist button before the page exists');
});

test('share text and pitch: real K-D, demo link, no multiplayer promise', () => {
  const f = new Funnel(demo, 'github');
  const t = f.shareText({ kills: 14, deaths: 3, factionName: 'Karens', won: true, modeLabel: 'Receipt Check' });
  assert.ok(t.includes('14-3') && t.includes('Karens') && t.includes('secured the block') && t.includes(demo.shareUrl));
  assert.ok(!/multiplayer/i.test(f.pitch(20)));
  assert.ok(f.pitch(20).includes('20'));
});

test('wireSteamLinks rewrites every tagged button', () => {
  const mk = (placement, small = false) => ({ dataset: { steam: placement }, classList: { contains: c => small && c === 'btn-wishlist-small' }, href: '', textContent: '', removeAttribute() {}, onclick: null });
  // Live: real Steam URL -> tagged links
  const liveEls = [mk('menu'), mk('pause', true)];
  const nLive = new Funnel({ ...demo, steamUrl: 'https://store.steampowered.com/app/1234560/' }, 'newgrounds').wireSteamLinks({ querySelectorAll: () => liveEls });
  assert.equal(nLive, 2);
  assert.ok(liveEls.every(e => e.href.includes('utm_source=newgrounds')));
  assert.ok(liveEls[1].textContent.startsWith('★ Coming soon') || liveEls[1].textContent.startsWith('★ Wishlist'));
  // Not live yet (no steamUrl, no storeUrl): buttons do nothing until the full game is purchasable
  const idleEls = [mk('menu'), mk('pause', true)];
  const nIdle = new Funnel({ steamUrl: null, storeUrl: null }, 'newgrounds').wireSteamLinks({ querySelectorAll: () => idleEls });
  assert.equal(nIdle, 2);
  assert.ok(idleEls.every(e => e.href === '#' && e.onclick() === false), 'buttons must do nothing before the store URL exists');
  // Full game on itch.io, no Steam yet: buttons link out to the itch.io page
  const itchEls = [mk('menu'), mk('pause', true)];
  const nItch = new Funnel(demo, 'newgrounds').wireSteamLinks({ querySelectorAll: () => itchEls });
  assert.equal(nItch, 2);
  assert.ok(itchEls.every(e => e.href.includes('call-of-karen-hoa-warfare-full') && e.href.includes('utm_source=newgrounds')), 'buttons link to the itch.io full-game page');
});
