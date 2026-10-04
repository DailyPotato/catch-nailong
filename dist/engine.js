(function (root) {
  'use strict';
  const palette = ['#ffd64a', '#ffa7bc', '#9acaff', '#aecc85', '#ffcf82', '#c3bbf0', '#a5db88', '#e8b6e8'];
  const TYPES = Array.from({ length: 32 }, (_, i) => ({ name: '角色 ' + (i + 1), color: palette[i % palette.length] }));
  const range = n => Array.from({ length: n }, (_, i) => i);
  const LEVELS = [
    { name: '初次见面', subtitle: '12 种造型混在一起，先观察再抓', types: range(12), copies: 3, seconds: 120 },
    { name: '奶龙派对', subtitle: '24 种造型自由堆叠，先给收集槽留空位', types: range(24), copies: 6, seconds: 420 },
    { name: '奶龙大本营', subtitle: '32 种造型、288 只，真正的大锅挑战', types: range(32), copies: 9, seconds: 600 }
  ];
  function rng(seed) {
    let a = seed >>> 0;
    return () => { a += 0x6D2B79F5; let t = a; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  }
  function shuffle(array, random) {
    for (let i = array.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [array[i], array[j]] = [array[j], array[i]]; }
    return array;
  }
  function project(item) { return { x: item.x, y: item.y - (item.z || 0) * .72 }; }
  function depth(item, index) { return item.z === undefined ? index * .14 : item.z; }
  function hit(item, x, y, margin = 36) {
    const screen = project(item), dx = x - screen.x, dy = y - screen.y, angle = item.angle || 0;
    return Math.abs(dx * Math.cos(angle) + dy * Math.sin(angle)) < margin && Math.abs(-dx * Math.sin(angle) + dy * Math.cos(angle)) < margin;
  }
  function positions(items, random) {
    // Each card has independent XY/rotation and an explicit Z height. No grid cells.
    // The guaranteed play route runs from high Z to low Z, so its next card is never buried.
    for (let attempt = 0; attempt < 4; attempt++) {
      items.forEach((item, i) => {
        item.x = 78 + random() * 384;
        item.y = 91 + random() * 283;
        item.z = i * .14;
        item.angle = (random() - .5) * 1.15;
        item.radius = 36;
      });
      const variety = new Set(items.filter((item, i) => canPick(items, i)).map(item => item.type)).size;
      if (variety >= Math.min(12, new Set(items.map(item => item.type)).size)) break;
    }
    return items;
  }
  function canPick(board, index) {
    if (!board[index]) return false;
    const a = board[index], center = project(a), height = depth(a, index);
    return !board.some((b, i) => (depth(b, i) > height || depth(b, i) === height && i > index) && hit(b, center.x, center.y));
  }
  function counts(items) { return items.reduce((result, item) => { result[item.type] = (result[item.type] || 0) + 1; return result; }, {}); }
  function makeRoute(items, tray, random) {
    const pools = new Map();
    items.forEach(item => { if (!pools.has(item.type)) pools.set(item.type, []); pools.get(item.type).push(item); });
    const held = counts(tray), route = []; let occupied = tray.length;
    const firstTypes = new Set();
    while (route.length < items.length) {
      const candidates = [];
      for (const [type, pool] of pools) {
        if (!pool.length) continue;
        const count = held[type] || 0, next = count === 2 ? occupied - 2 : occupied + 1;
        if (next > 6) continue;
        const hasPair = count === 1 || Object.entries(held).some(([key, value]) => Number(key) !== type && value === 2);
        if (next === 6 && !hasPair) continue;
        // The first visible solution steps use different characters; later steps interleave
        // pending pairs/singles and typically keep four to six slots occupied.
        if (!tray.length && route.length < 3 && pools.size >= 3 && firstTypes.has(type)) continue;
        let weight = count === 2 ? (occupied >= 6 ? 20 : .055) : count === 1 ? .9 : 1.2;
        const currentPair = Object.values(held).includes(2);
        if (occupied === 4 && !currentPair) weight = count === 1 ? 12 : count === 0 ? .02 : weight;
        if (occupied === 5 && currentPair) weight = count === 0 ? 2.8 : count === 1 ? .25 : weight;
        if (route.at(-1)?.type === type) weight *= .025;
        weight *= Math.sqrt(pool.length);
        candidates.push({ type, weight });
      }
      if (!candidates.length) return null;
      let draw = random() * candidates.reduce((sum, item) => sum + item.weight, 0), chosen = candidates.at(-1).type;
      for (const candidate of candidates) { draw -= candidate.weight; if (draw <= 0) { chosen = candidate.type; break; } }
      route.push(pools.get(chosen).pop()); firstTypes.add(chosen);
      const count = held[chosen] || 0;
      if (count === 2) { delete held[chosen]; occupied -= 2; } else { held[chosen] = count + 1; occupied++; }
    }
    return occupied === 0 ? route : null;
  }
  class Game {
    constructor(level = 0, seed = Date.now()) {
      if (!Number.isInteger(level) || !LEVELS[level]) throw new Error('关卡不存在');
      this.level = level; this.seed = seed; this.random = rng(seed); this.tray = []; this.history = [];
      this.removed = 0; this.status = 'ready'; this.remaining = LEVELS[level].seconds;
      this.tools = { undo: 3, shake: 3, hint: 3 };
      let nextId = 0;
      const cards = [];
      for (const type of LEVELS[level].types) for (let i = 0; i < LEVELS[level].copies; i++) cards.push({ id: nextId++, type });
      const route = makeRoute(cards, [], this.random);
      if (!route) throw new Error('无法生成可解关卡');
      this.board = positions(route.reverse(), this.random);
      this.total = this.board.length;
    }
    start() { if (this.status === 'ready' || this.status === 'paused') this.status = 'playing'; }
    pause() { if (this.status === 'playing') this.status = 'paused'; }
    tick(seconds) {
      if (this.status !== 'playing' || !Number.isFinite(seconds) || seconds < 0) return;
      this.remaining = Math.max(0, this.remaining - seconds);
      if (this.remaining === 0) this.status = 'timeout';
    }
    pick(id) {
      if (this.status !== 'playing') return { ok: false, reason: 'inactive' };
      const index = this.board.findIndex(item => item.id === id);
      if (index === -1 || !canPick(this.board, index)) return { ok: false, reason: 'covered' };
      this.history.push({ board: this.board.map(x => ({ ...x })), tray: this.tray.map(x => ({ ...x })), removed: this.removed });
      if (this.history.length > 3) this.history.shift();
      const item = this.board.splice(index, 1)[0];
      const last = this.tray.map(x => x.type).lastIndexOf(item.type);
      this.tray.splice(last === -1 ? this.tray.length : last + 1, 0, item);
      const match = this.tray.filter(x => x.type === item.type);
      const matched = match.length === 3;
      if (matched) { this.tray = this.tray.filter(x => x.type !== item.type); this.removed += 3; }
      // A seventh item that forms a triple is valid: match before capacity check.
      if (this.tray.length >= 7) this.status = 'full';
      else if (this.board.length === 0 && this.tray.length === 0) this.status = 'won';
      return { ok: true, item, matched, match: matched ? match : [], status: this.status };
    }
    undo() {
      if (!['playing', 'full'].includes(this.status) || !this.tools.undo || !this.history.length) return false;
      const snapshot = this.history.pop();
      this.board = snapshot.board; this.tray = snapshot.tray; this.removed = snapshot.removed;
      this.tools.undo--; this.status = 'playing'; return true;
    }
    shake() {
      if (this.status !== 'playing' || !this.tools.shake) return false;
      const trayCounts = counts(this.tray);
      // Six different items cannot be completed within seven slots; undo must make room first.
      if (this.tray.length === 6 && !Object.values(trayCounts).includes(2)) return false;
      const route = makeRoute(this.board, this.tray, this.random);
      if (!route) return false;
      this.board = positions(route.reverse(), this.random);
      this.tools.shake--; this.history = []; return true;
    }
    hint() {
      if (this.status !== 'playing' || !this.tools.hint) return null;
      const trayCounts = counts(this.tray);
      const exposed = this.board.filter((item, index) => canPick(this.board, index));
      exposed.sort((a, b) => (trayCounts[b.type] || 0) - (trayCounts[a.type] || 0) || this.board.indexOf(b) - this.board.indexOf(a));
      const noPair = !Object.values(trayCounts).includes(2);
      const item = exposed.find(x => (this.tray.length < 6 || trayCounts[x.type] === 2) && !(this.tray.length === 5 && noPair && !trayCounts[x.type]));
      if (!item) return null;
      this.tools.hint--; return item;
    }
    summary() {
      return { level: this.level + 1, status: this.status, remaining: Math.ceil(this.remaining), removed: this.removed, total: this.total, variety: LEVELS[this.level].types.length, tray: this.tray.map(x => TYPES[x.type].name), tools: { ...this.tools }, exposed: this.board.filter((x, i) => canPick(this.board, i)).map(x => ({ id: x.id, name: TYPES[x.type].name, z: x.z })) };
    }
  }
  const api = { Game, TYPES, LEVELS, canPick, rng, project, hit, depth, makeRoute };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Nailong = api;
})(typeof globalThis === 'undefined' ? this : globalThis);
