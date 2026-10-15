// Shuffle bag: no line repeats until its pool is exhausted, and no immediate repeat across refills.
// FIX vs v4 C#: bags are keyed per (pool, script) so switching Clean<->Steam can never index
// past the end of a different-length list.
export class ShuffleBag {
  constructor(rng) {
    this.rng = rng;
    this.bags = new Map();
  }

  draw(key, items) {
    if (!items || items.length === 0) return null;
    let bag = this.bags.get(key);
    if (!bag || bag.size !== items.length || bag.queue.length === 0) {
      const q = items.map((_, i) => i);
      for (let i = q.length - 1; i > 0; i--) {
        const j = Math.floor(this.rng() * (i + 1));
        [q[i], q[j]] = [q[j], q[i]];
      }
      const last = bag ? bag.last : undefined;
      // queue pops from the end: make sure the first draw of the new cycle != last draw of the old one
      if (q.length > 1 && q[q.length - 1] === last) [q[0], q[q.length - 1]] = [q[q.length - 1], q[0]];
      bag = { size: items.length, queue: q, last };
      this.bags.set(key, bag);
    }
    const idx = bag.queue.pop();
    bag.last = idx;
    return items[idx];
  }
}
