#!/usr/bin/env node
// A scripted "second player" for testing online play on your own machine.
//   node tools/online_bot.mjs [room] [count] [url]
//   room   room code, or 'auto' for Quick Match (default: auto)
//   count  how many bot players to connect (default 1)
//   url    server (default ws://localhost:8080/ws)
// Each bot runs around the cul-de-sac in circles, jumping and shooting, and prints its ping.
import { OnlineSession } from '../web/src/engine/online.js';

const [room = 'auto', count = '1', base = 'ws://localhost:8080/ws'] = process.argv.slice(2);
const FACTIONS = ['karens', 'tradwives', 'hoaDads', 'furries', 'trumpers', 'pickleballRetirees'];

async function runBot(i) {
  const url = new URL(base);
  url.searchParams.set('room', room);
  url.searchParams.set('name', `TestBot${i + 1}`);
  url.searchParams.set('faction', FACTIONS[i % FACTIONS.length]);
  const s = await OnlineSession.join({ url: url.toString() });
  console.log(`bot ${i + 1} joined room ${s.roomCode} as ${s.actorId} (team ${s.team})`);
  const net = s.net;
  let t = 0;
  const timer = setInterval(() => {
    t += 0.05;
    net.currentInput.move = [1, Math.sin(t) * 0.6];
    net.currentInput.keys = { fire: Math.floor(t / 2) % 2 === 0, jump: Math.floor(t * 4) % 11 === 0, sprint: true };
    net.currentInput.yaw = t * 0.7;
  }, 50);
  const log = setInterval(() => console.log(`bot ${i + 1}: ping ${s.latency} ms, ${net.latest?.stats?.find(x => x.id === s.actorId)?.k ?? 0} kills`), 5000);
  net.onDisconnect = () => { clearInterval(timer); clearInterval(log); console.log(`bot ${i + 1} disconnected`); };
}

for (let i = 0; i < Number(count); i++) runBot(i).catch(e => console.error('bot failed:', e.message));
