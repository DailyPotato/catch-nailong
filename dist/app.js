(() => {
  'use strict';
  const { Game, LEVELS, TYPES, canPick, project, hit, depth } = window.Nailong;
  const $ = selector => document.querySelector(selector);
  const board = $('#board'), ctx = board.getContext('2d'), overlay = $('#overlay');
  let game = new Game(0), assets = [], assetList = [], loaded = false, loadingError = false;
  let hintId = null, hintUntil = 0, selectedId = null, hoverId = null, soundOn = false, audio;
  let previousTime = performance.now(), lastSecond = -1, dirty = true, particles = [], dialogWasPlaying = false;
  let exposedIds = new Set(), layoutMotion = null, busyUntil = 0;
  const traySlots = Array.from({ length: 7 }, () => {
    const slot = document.createElement('div'); slot.className = 'tray-slot empty';
    const canvas = document.createElement('canvas'); canvas.width = 130; canvas.height = 130; slot.append(canvas); $('#tray').append(slot); return slot;
  });
  function rounded(context, x, y, w, h, r) {
    context.beginPath(); context.roundRect(x, y, w, h, r);
  }
  function imageContain(context, image, x, y, width, height) {
    const imageWidth = image.naturalWidth || image.width, imageHeight = image.naturalHeight || image.height;
    const scale = Math.min(width / imageWidth, height / imageHeight);
    const w = imageWidth * scale, h = imageHeight * scale;
    context.drawImage(image, x + (width - w) / 2, y + (height - h) / 2, w, h);
  }
  function drawToy(context, item, size, blocked = false) {
    context.save();
    if (blocked) context.globalAlpha = .7;
    const elevation = Math.min(9, (item.z || 0) * .16), thickness = size < 100 ? 4 : 6;
    context.shadowColor = '#49345948'; context.shadowBlur = 5 + elevation; context.shadowOffsetY = thickness + elevation;
    rounded(context, -size / 2 + 1, -size / 2 + thickness, size - 2, size, size * .2);
    context.fillStyle = blocked ? '#9782ac' : '#b59acb'; context.fill();
    context.shadowColor = 'transparent';
    rounded(context, -size / 2, -size / 2, size, size, size * .2);
    context.fillStyle = blocked ? '#e9e2ef' : '#fffefb'; context.fill();
    context.shadowColor = 'transparent'; context.lineWidth = 2;
    context.strokeStyle = blocked ? '#baa8ca' : TYPES[item.type].color; context.stroke();
    context.save(); rounded(context, -size / 2 + 4, -size / 2 + 4, size - 8, size - 8, size * .17); context.clip();
    if (assets[item.type]) imageContain(context, assets[item.type], -size / 2 + 5, -size / 2 + 5, size - 10, size - 10);
    context.restore();
    if (blocked) { rounded(context, -size / 2, -size / 2, size, size, size * .2); context.fillStyle = '#775e9120'; context.fill(); }
    context.restore();
  }
  function render(now) {
    if (hintId !== null && now > hintUntil) hintId = null;
    ctx.clearRect(0, 0, 540, 440);
    const progress = layoutMotion ? Math.min(1, (now - layoutMotion.born) / 500) : 1, eased = 1 - Math.pow(1 - progress, 3);
    const ordered = game.board.map((item, index) => ({ item, height: depth(item, index) })).sort((a, b) => a.height - b.height);
    ordered.forEach(({ item }) => {
      const blocked = !exposedIds.has(item.id), target = project(item), from = layoutMotion?.from.get(item.id);
      const screen = from ? { x: from.x + (target.x - from.x) * eased, y: from.y + (target.y - from.y) * eased } : target;
      const angle = from ? from.angle + (item.angle - from.angle) * eased : item.angle;
      ctx.save(); ctx.translate(screen.x, screen.y); ctx.rotate(angle); drawToy(ctx, item, 72, blocked);
      if (item.id === hintId || item.id === selectedId || (item.id === hoverId && !blocked)) {
        ctx.lineWidth = item.id === hintId ? 4 : 3; ctx.strokeStyle = item.id === hintId ? '#c75ba0' : '#8560b0';
        rounded(ctx, -39, -39, 78, 78, 17); ctx.stroke();
      }
      ctx.restore();
    });
    particles = particles.filter(p => now - p.born < 600);
    particles.forEach(p => { const t = (now - p.born) / 600; ctx.save(); ctx.globalAlpha = 1 - t; ctx.translate(p.x + p.vx * t, p.y + p.vy * t + 65 * t * t); ctx.rotate(t * 3); ctx.fillStyle = p.color; ctx.fillRect(-3, -3, 6, 6); ctx.restore(); });
    dirty = false;
  }
  function drawMascot(now = 0) {
    const c = $('#mascot').getContext('2d'); c.clearRect(0, 0, 400, 400);
    if (assets[0]) { c.save(); c.translate(200, 200 + Math.sin(now / 900) * 6); c.rotate(Math.sin(now / 1200) * .035); drawToy(c, { type: 0 }, 310); c.restore(); }
  }
  function say(message) { $('#message').textContent = message; }
  function beep(matched = false) {
    if (!soundOn) return;
    try {
      audio ||= new (window.AudioContext || window.webkitAudioContext)(); audio.resume();
      [0, ...(matched ? [1, 2] : [])].forEach((n) => { const oscillator = audio.createOscillator(), gain = audio.createGain(); oscillator.type = 'sine'; oscillator.frequency.value = matched ? [660, 830, 990][n] : 540; gain.gain.setValueAtTime(.055, audio.currentTime + n * .08); gain.gain.exponentialRampToValueAtTime(.001, audio.currentTime + n * .08 + .14); oscillator.connect(gain); gain.connect(audio.destination); oscillator.start(audio.currentTime + n * .08); oscillator.stop(audio.currentTime + n * .08 + .15); });
    } catch { soundOn = false; updateSound(); }
  }
  function animate(element, className) { element.classList.remove(className); void element.offsetWidth; element.classList.add(className); }
  function updateTimer() {
    const seconds = Math.ceil(game.remaining);
    if (lastSecond === seconds) return; lastSecond = seconds;
    const value = String(Math.floor(seconds / 60)).padStart(2, '0') + ':' + String(seconds % 60).padStart(2, '0');
    $('#timer strong').textContent = value; $('#timer').setAttribute('aria-label', '剩余时间 ' + value);
    $('#timer').classList.toggle('urgent', seconds <= 30 && game.status === 'playing');
  }
  function showOverlay(mark, title, text, buttons) {
    overlay.replaceChildren(); overlay.hidden = false;
    const badge = document.createElement('div'); badge.className = 'overlay-mark'; badge.textContent = mark;
    const heading = document.createElement('h3'); heading.textContent = title;
    const copy = document.createElement('p'); copy.textContent = text;
    const controls = document.createElement('div'); controls.className = 'overlay-buttons';
    buttons.forEach(({ label, action, secondary = false, disabled = false }) => { const button = document.createElement('button'); button.className = secondary ? 'secondary-button' : 'primary-button'; button.textContent = label; button.disabled = disabled; button.addEventListener('click', action); controls.append(button); });
    overlay.append(badge, heading, copy, controls);
  }
  function start() { if (!loaded) return; game.start(); previousTime = performance.now(); overlay.hidden = true; dirty = true; updateUI(); say('先凑相同的三只，留住收集槽的空位。'); board.focus({ preventScroll: true }); }
  function newGame(level = game.level) { game = new Game(level); hintId = null; selectedId = null; hoverId = null; particles = []; layoutMotion = null; busyUntil = 0; lastSecond = -1; previousTime = performance.now(); updateUI(); say(LEVELS[level].subtitle); dirty = true; }
  function updateOverlay() {
    const status = game.status;
    if (status === 'playing') { overlay.hidden = true; return; }
    if (!loaded) { showOverlay('…', loadingError ? '图片没加载成功' : '奶龙正在集合', loadingError ? '请重新加载角色图片后再开始。' : '正在准备奶龙、奶蛙的抓捕照片…', [{ label: loadingError ? '重试加载' : '准备中…', action: loadAssets, disabled: !loadingError }]); return; }
    if (status === 'ready') showOverlay('✦', game.level === 0 ? '奶龙开锅啦！' : LEVELS[game.level].name + '，开锅！', '点三个相同造型就能抱走，收集槽装满七格就失败。', [{ label: '开始抓奶龙', action: start }]);
    if (status === 'paused') showOverlay('Ⅱ', '奶龙等你回来', '倒计时已暂停，准备好了就继续抓。', [{ label: '继续抓', action: start }, { label: '重新开锅', action: () => newGame(), secondary: true }]);
    if (status === 'full') showOverlay('！', '哎呀，装不下啦', '收集槽挤满了。撤回一步，给相同的奶龙留个位置。', [{ label: '撤回继续 · ' + game.tools.undo, action: undo, disabled: !game.tools.undo || !game.history.length }, { label: '重新开锅', action: () => newGame(), secondary: true }]);
    if (status === 'timeout') showOverlay('◷', '奶龙先溜走啦', '时间到！再来一锅，优先抓已经收集的那一对。', [{ label: '再抓一锅', action: () => newGame() }]);
    if (status === 'won') {
      const spent = Math.ceil(LEVELS[game.level].seconds - game.remaining);
      showOverlay('♥', game.level === 2 ? '奶龙全部抱回家！' : '这一锅，抓干净啦！', '用时 ' + spent + ' 秒，抱走 ' + game.total + ' 只。' + (game.level === 2 ? '三锅挑战完成，抓捕高手就是你。' : '下一锅藏着更多奶龙和奶蛙。'), [{ label: game.level === 2 ? '从头再抓' : '下一锅，继续抓', action: () => newGame(game.level === 2 ? 0 : game.level + 1) }, { label: '再玩本关', action: () => newGame(), secondary: true }]);
    }
  }
  function updateUI() {
    exposedIds = new Set(game.board.filter((item, index) => canPick(game.board, index)).map(item => item.id));
    $('#round-label').textContent = ['第一锅', '第二锅', '第三锅'][game.level] + ' · ' + LEVELS[game.level].types.length + ' 种造型'; $('#round-title').textContent = LEVELS[game.level].name;
    document.querySelectorAll('[data-level]').forEach(button => { const chosen = Number(button.dataset.level) === game.level; button.classList.toggle('selected', chosen); button.setAttribute('aria-current', chosen ? 'step' : 'false'); button.querySelector('.level-check').textContent = chosen ? '●' : ''; });
    traySlots.forEach((slot, i) => { const item = game.tray[i], context = slot.firstChild.getContext('2d'); context.clearRect(0, 0, 130, 130); slot.classList.toggle('empty', !item); slot.setAttribute('aria-label', '第 ' + (i + 1) + ' 格：' + (item ? TYPES[item.type].name : '空')); if (item && assets[item.type]) imageContain(context, assets[item.type], 7, 7, 116, 116); });
    $('#tray').classList.toggle('danger', game.tray.length >= 5);
    $('#tray-label b').textContent = game.tray.length + ' / 7'; $('#progress-label').textContent = '已抱走 ' + game.removed + ' / ' + game.total;
    const percent = Math.round(game.removed / game.total * 100); $('#progress').style.width = percent + '%'; $('.progress-track').setAttribute('aria-valuenow', percent);
    ['undo', 'shake', 'hint'].forEach(tool => { $('#' + tool + ' b').textContent = game.tools[tool]; $('#' + tool).disabled = performance.now() < busyUntil || !loaded || !game.tools[tool] || (tool === 'undo' ? !['playing', 'full'].includes(game.status) || !game.history.length : game.status !== 'playing'); });
    $('#pause').disabled = !['playing', 'paused'].includes(game.status); $('#pause').textContent = game.status === 'paused' ? '▷' : 'Ⅱ'; $('#pause').setAttribute('aria-label', game.status === 'paused' ? '继续游戏' : '暂停游戏');
    updateTimer(); updateOverlay(); dirty = true;
  }
  function pick(id) {
    if (performance.now() < busyUntil) return { ok: false, reason: 'animating' };
    const result = game.pick(id); if (!result.ok) { if (result.reason === 'covered') say('这只被压住了，先抓上面的，或者摇一摇。'); return result; }
    hintId = null; selectedId = null; beep(result.matched);
    if (result.matched) { const now = performance.now(), screen = project(result.item); for (let i = 0; i < 12; i++) particles.push({ x: screen.x, y: screen.y, vx: (Math.random() - .5) * 140, vy: -Math.random() * 100 - 30, color: ['#ffc73b', '#ad7acc', '#fb8eae'][i % 3], born: now }); animate($('#tray'), 'match-animation'); say('三只 ' + TYPES[result.item.type].name + '，抱走！'); }
    else { say(game.tray.length >= 5 ? '收集槽快满了，优先凑齐已有的一对！' : '抓到 ' + TYPES[result.item.type].name + '，再找相同的。'); }
    updateUI(); if (!result.matched) { const index = game.tray.findIndex(x => x.id === id); if (index >= 0) animate(traySlots[index], 'new'); }
    return result;
  }
  function undo() { if (performance.now() < busyUntil) return; if (game.undo()) { hintId = null; selectedId = null; previousTime = performance.now(); updateUI(); say('已撤回上一步。这次先找相同造型。'); } }
  function shake() { if (performance.now() < busyUntil) return; const from = new Map(game.board.map(item => [item.id, { ...project(item), angle: item.angle }])); if (game.shake()) { hintId = null; selectedId = null; const now = performance.now(); layoutMotion = { from, born: now }; busyUntil = now + 500; animate($('.bowl-wrap'), 'shake-animation'); updateUI(); say('上下层翻好啦！先把收集槽里的凑成三只。'); } else if (game.status === 'playing' && game.tools.shake) say('空位太少了，先撤回一只，给三消留出空间。'); }
  function hint() { const item = game.hint(); if (item) { hintId = item.id; hintUntil = performance.now() + 3500; updateUI(); say('粉色框圈出的 ' + TYPES[item.type].name + ' 可以抓。'); } else if (game.status === 'playing') say('先撤回腾出空位，或者摇一摇翻出相同造型。'); }
  function pause() { if (game.status === 'playing') { game.pause(); updateUI(); } else if (game.status === 'paused' && !document.querySelector('dialog[open]')) start(); }
  function atPoint(event) { const rect = board.getBoundingClientRect(), x = (event.clientX - rect.left) * 540 / rect.width, y = (event.clientY - rect.top) * 440 / rect.height; const ordered = game.board.map((item, index) => ({ item, height: depth(item, index) })).sort((a, b) => b.height - a.height); for (const { item } of ordered) if (hit(item, x, y)) return item; return null; }
  board.addEventListener('pointerup', event => { if (game.status !== 'playing') return; const item = atPoint(event); if (item) pick(item.id); });
  board.addEventListener('pointermove', event => { const item = atPoint(event), next = item?.id ?? null; if (next !== hoverId) { hoverId = next; dirty = true; } });
  board.addEventListener('pointerleave', () => { hoverId = null; dirty = true; });
  board.addEventListener('keydown', event => { if (game.status !== 'playing') return; const exposed = game.board.filter((x, i) => canPick(game.board, i)); if (event.key.startsWith('Arrow')) { event.preventDefault(); const direction = ['ArrowRight', 'ArrowDown'].includes(event.key) ? 1 : -1; const index = exposed.findIndex(x => x.id === selectedId); selectedId = exposed[(index + direction + exposed.length) % exposed.length]?.id ?? null; dirty = true; const item = exposed.find(x => x.id === selectedId); if (item) say('已选中 ' + TYPES[item.type].name + '，按回车抓取。'); } if (event.key === 'Enter' && selectedId !== null) { event.preventDefault(); pick(selectedId); } });
  document.addEventListener('keydown', event => { if (document.querySelector('dialog[open]') || event.target instanceof HTMLButtonElement) return; if (event.key.toLowerCase() === 'p' || event.key === 'Escape') { event.preventDefault(); pause(); } if (event.code === 'Space' && game.status === 'playing') { event.preventDefault(); shake(); } });
  document.addEventListener('visibilitychange', () => { if (document.hidden && game.status === 'playing') { game.pause(); updateUI(); } previousTime = performance.now(); });
  $('#undo').addEventListener('click', undo); $('#shake').addEventListener('click', shake); $('#hint').addEventListener('click', hint); $('#pause').addEventListener('click', pause);
  document.querySelectorAll('[data-level]').forEach(button => button.addEventListener('click', () => newGame(Number(button.dataset.level))));
  $('.brand').addEventListener('click', event => { if (window.NAILONG_ASSETS) { event.preventDefault(); newGame(0); } });
  function updateSound() { $('#sound').setAttribute('aria-pressed', String(soundOn)); $('#sound').setAttribute('aria-label', soundOn ? '关闭音效' : '打开音效'); $('#sound span').textContent = soundOn ? '音效开' : '音效关'; }
  $('#sound').addEventListener('click', () => { soundOn = !soundOn; updateSound(); if (soundOn) beep(); });
  function openDialog(dialog) { dialogWasPlaying = game.status === 'playing'; if (dialogWasPlaying) game.pause(); updateUI(); dialog.showModal(); }
  $('#help').addEventListener('click', () => openDialog($('#help-dialog'))); $('#sources').addEventListener('click', () => openDialog($('#sources-dialog')));
  document.querySelectorAll('dialog').forEach(dialog => { dialog.querySelector('.dialog-close').addEventListener('click', () => dialog.close()); dialog.addEventListener('close', () => { if (dialogWasPlaying && game.status === 'paused' && !document.hidden) start(); dialogWasPlaying = false; }); });
  $('.dialog-done').addEventListener('click', () => $('#help-dialog').close());
  async function loadAssets() {
    loaded = false; loadingError = false; updateUI();
    try {
      if (window.NAILONG_ASSETS) assetList = window.NAILONG_ASSETS;
      else { const response = await fetch('assets/characters.json'); if (!response.ok) throw new Error('图片清单不可用'); assetList = await response.json(); }
      if (!Array.isArray(assetList) || assetList.length !== TYPES.length) throw new Error('图片数量不完整');
      assets = await Promise.all(assetList.map((item, i) => new Promise((resolve, reject) => { const image = new Image(); image.onload = () => { TYPES[i].name = item.name; const texture = document.createElement('canvas'); texture.width = 256; texture.height = 256; imageContain(texture.getContext('2d'), image, 0, 0, 256, 256); resolve(texture); }; image.onerror = () => reject(new Error(item.name + ' 图片加载失败')); image.src = item.data || 'assets/' + item.file; })));
      $('#source-list').replaceChildren(); assetList.forEach(item => { const li = document.createElement('li'), link = document.createElement('a'); link.href = item.source; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.textContent = item.name; li.append(link); $('#source-list').append(li); });
      loaded = true; updateUI(); drawMascot();
    } catch (error) { loadingError = true; console.error('角色图片加载失败', error); updateUI(); }
  }
  const modelContext = document.modelContext;
  if (modelContext?.registerTool) {
    const lifecycle = new AbortController();
    const tools = [{ name: 'read_nailong_game', description: '读取抓奶龙本局状态与当前可抓角色。', inputSchema: { type: 'object', properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true }, execute: () => game.summary() }, { name: 'pick_nailong', description: '抓取指定可见角色，更新七格收集槽并在相同造型满三只时消除。', inputSchema: { type: 'object', properties: { id: { type: 'integer' } }, required: ['id'], additionalProperties: false }, annotations: { readOnlyHint: false }, execute: input => { if (!input || !Number.isInteger(input.id) || Object.keys(input).some(key => key !== 'id')) throw new Error('请提供整数角色 id'); const result = pick(input.id); if (!result.ok) throw new Error('当前无法抓取该角色'); return game.summary(); } }];
    tools.forEach(tool => { try { Promise.resolve(modelContext.registerTool(tool, { signal: lifecycle.signal })).catch(error => console.warn('游戏工具注册失败', error)); } catch (error) { console.warn('游戏工具注册失败', error); } });
    window.addEventListener('pagehide', () => lifecycle.abort(), { once: true });
  }
  function frame(now) {
    const before = game.status; game.tick(Math.max(0, now - previousTime) / 1000); previousTime = now;
    if (before !== game.status) updateUI(); else updateTimer();
    if (layoutMotion && now >= busyUntil) { layoutMotion = null; updateUI(); }
    if (dirty || particles.length || hintId !== null || layoutMotion) render(now);
    if (loaded && now % 80 < 18) drawMascot(now);
    requestAnimationFrame(frame);
  }
  updateUI(); loadAssets(); requestAnimationFrame(frame);
})();
