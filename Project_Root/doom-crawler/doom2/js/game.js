// js/game.js
// Ties maze generation, A* enemy AI, and the raycasting renderer together
// into a playable loop, wired to the start-screen / pause-menu / settings
// UI and the weapon + damage-flash effects in index.html.

(function () {
  const canvas = document.getElementById('scene');
  const ctx = canvas.getContext('2d');
  const minimapCanvas = document.getElementById('minimap');
  const mctx = minimapCanvas.getContext('2d');

  const W = canvas.width;
  const H = canvas.height;

  // ---- UI elements ----
  const hudFloor = document.getElementById('floor');
  const hudHp = document.getElementById('hp');
  const hudKills = document.getElementById('kills');
  const hudKeys = document.getElementById('keys');

  const crosshairEl = document.getElementById('crosshair');
  const damageFlashEl = document.getElementById('damage-flash');
  const weaponEl = document.getElementById('weapon');
  const muzzleEl = document.getElementById('muzzle');

  const overlay = document.getElementById('overlay');
  const overlayTitle = overlay.querySelector('h1');
  const overlaySubtitle = overlay.querySelector('.subtitle');
  const overlayFeatures = overlay.querySelector('.features');
  const overlayControls = overlay.querySelector('.controls');
  const startBtn = document.getElementById('start-btn');

  const pauseMenu = document.getElementById('pause-menu');
  const pauseResumeBtn = document.getElementById('pause-resume');
  const pauseRestartBtn = document.getElementById('pause-restart');
  const pauseTitleBtn = document.getElementById('pause-title');

  const sensInput = document.getElementById('setting-sensitivity');
  const sensValue = document.getElementById('setting-sensitivity-value');
  const turnInput = document.getElementById('setting-turnspeed');
  const turnValue = document.getElementById('setting-turnspeed-value');
  const enemySpeedInput = document.getElementById('setting-enemy-speed');
  const enemySpeedValue = document.getElementById('setting-enemy-speed-value');
  const minimapCheckbox = document.getElementById('setting-minimap');
  const pathsCheckbox = document.getElementById('setting-paths');
  const crosshairCheckbox = document.getElementById('setting-crosshair');
  const invertLookCheckbox = document.getElementById('setting-invert-look');
  const settingsResetBtn = document.getElementById('setting-reset');

  // ---- Settings (persisted) ----
  const SETTINGS_KEY = 'dungeonCrawlerSettings';
  const DEFAULT_SETTINGS = {
    sensitivity: 0.0025,
    turnSpeed: 2.6,
    enemySpeed: 1.0,
    minimap: true,
    paths: false,
    crosshair: true,
    invertLook: false,
  };
  let settings = { ...DEFAULT_SETTINGS };

  function loadSettings() {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (raw) settings = { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
    } catch (e) {
      settings = { ...DEFAULT_SETTINGS };
    }
  }

  function saveSettings() {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch (e) {
      /* ignore (e.g. storage disabled) */
    }
  }

  function applySettingsToUI() {
    sensInput.value = settings.sensitivity;
    sensValue.textContent = settings.sensitivity.toFixed(4);
    turnInput.value = settings.turnSpeed;
    turnValue.textContent = settings.turnSpeed.toFixed(1);
    enemySpeedInput.value = settings.enemySpeed;
    enemySpeedValue.textContent = settings.enemySpeed.toFixed(2) + 'x';
    minimapCheckbox.checked = settings.minimap;
    pathsCheckbox.checked = settings.paths;
    crosshairCheckbox.checked = settings.crosshair;
    invertLookCheckbox.checked = settings.invertLook;
    applyVisualSettings();
  }

  function applyVisualSettings() {
    minimapCanvas.style.display = settings.minimap ? 'block' : 'none';
    crosshairEl.classList.toggle('hidden', !settings.crosshair);
  }

  sensInput.addEventListener('input', () => {
    settings.sensitivity = parseFloat(sensInput.value);
    sensValue.textContent = settings.sensitivity.toFixed(4);
    saveSettings();
  });
  turnInput.addEventListener('input', () => {
    settings.turnSpeed = parseFloat(turnInput.value);
    turnValue.textContent = settings.turnSpeed.toFixed(1);
    saveSettings();
  });
  enemySpeedInput.addEventListener('input', () => {
    settings.enemySpeed = parseFloat(enemySpeedInput.value);
    enemySpeedValue.textContent = settings.enemySpeed.toFixed(2) + 'x';
    saveSettings();
  });
  minimapCheckbox.addEventListener('change', () => {
    settings.minimap = minimapCheckbox.checked;
    applyVisualSettings();
    saveSettings();
  });
  pathsCheckbox.addEventListener('change', () => {
    settings.paths = pathsCheckbox.checked;
    saveSettings();
  });
  crosshairCheckbox.addEventListener('change', () => {
    settings.crosshair = crosshairCheckbox.checked;
    applyVisualSettings();
    saveSettings();
  });
  invertLookCheckbox.addEventListener('change', () => {
    settings.invertLook = invertLookCheckbox.checked;
    saveSettings();
  });
  settingsResetBtn.addEventListener('click', () => {
    settings = { ...DEFAULT_SETTINGS };
    applySettingsToUI();
    saveSettings();
  });

  // ---- Game state ----
  const state = {
    started: false,
    paused: false,
    gameOver: false,
    floor: 1,
    kills: 0,
    tiles: null,
    tw: 0,
    th: 0,
    player: { x: 1.5, y: 1.5, angle: 0, health: 100, keys: 0, requiredKeys: 1 },
    enemies: [],
    pickups: [],
    exit: null,
    keysHeld: {},
  };

  const dist2 = (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;

  function tileFree(tiles, x, y) {
    if (x < 0 || y < 0 || y >= tiles.length || x >= tiles[0].length) return false;
    return tiles[y][x] === 0;
  }

  function randomFloorCell(tiles, tw, th) {
    let x, y;
    do {
      x = Math.floor(Math.random() * tw);
      y = Math.floor(Math.random() * th);
    } while (tiles[y][x] !== 0);
    return { x, y };
  }

  // Exit placement: sample candidate tiles, run A* from spawn to each, and
  // keep the tile with the longest path -- the farthest reachable point.
  function farthestTile(tiles, tw, th, sx, sy) {
    let best = null;
    let bestLen = -1;
    for (let i = 0; i < 40; i++) {
      const c = randomFloorCell(tiles, tw, th);
      const path = AStar.find(tiles, sx, sy, c.x, c.y);
      if (path && path.length > bestLen) {
        bestLen = path.length;
        best = c;
      }
    }
    return best || { x: sx, y: sy };
  }

  function buildLevel(floorNum) {
    const cols = 5 + floorNum;
    const rows = 5 + floorNum;
    const maze = Maze.generate(cols, rows);
    const { tiles, w, h } = Maze.toTiles(maze);
    state.tiles = tiles;
    state.tw = w;
    state.th = h;

    const spawn = randomFloorCell(tiles, w, h);
    state.player.x = spawn.x + 0.5;
    state.player.y = spawn.y + 0.5;
    state.player.angle = Math.random() * Math.PI * 2;
    state.player.requiredKeys = Math.min(4, 1 + Math.floor(floorNum / 2));
    state.player.keys = 0;

    const exitCell = farthestTile(tiles, w, h, spawn.x, spawn.y);
    state.exit = { x: exitCell.x + 0.5, y: exitCell.y + 0.5 };

    state.pickups = [];
    for (let i = 0; i < state.player.requiredKeys; i++) {
      const c = randomFloorCell(tiles, w, h);
      state.pickups.push({ type: 'key', x: c.x + 0.5, y: c.y + 0.5, taken: false });
    }
    const healthCount = 2 + Math.floor(floorNum / 2);
    for (let i = 0; i < healthCount; i++) {
      const c = randomFloorCell(tiles, w, h);
      state.pickups.push({ type: 'health', x: c.x + 0.5, y: c.y + 0.5, taken: false });
    }

    state.enemies = [];
    const enemyCount = 2 + floorNum;
    for (let i = 0; i < enemyCount; i++) {
      const c = randomFloorCell(tiles, w, h);
      state.enemies.push({
        x: c.x + 0.5,
        y: c.y + 0.5,
        health: 30,
        baseSpeed: 1.25 + floorNum * 0.08,
        path: null,
        pathIndex: 1,
        repathAt: 0,
        cooldown: 0,
        alive: true,
      });
    }
  }

  // ---- Overlay (start screen / game-over screen share the same markup) ----
  let overlayMode = 'start';

  function showStartOverlay() {
    overlayMode = 'start';
    overlayTitle.textContent = 'DUNGEON CRAWLER';
    overlaySubtitle.textContent = 'A tiny DOOM-style raycaster';
    overlayFeatures.style.display = '';
    overlayControls.style.display = '';
    startBtn.textContent = 'ENTER THE DUNGEON';
    overlay.classList.remove('hidden');
  }

  function showGameOverOverlay() {
    overlayMode = 'gameover';
    overlayTitle.textContent = 'YOU DIED';
    overlaySubtitle.textContent = `Reached floor ${state.floor} \u00b7 ${state.kills} kills`;
    overlayFeatures.style.display = 'none';
    overlayControls.style.display = 'none';
    startBtn.textContent = 'TRY AGAIN';
    overlay.classList.remove('hidden');
  }

  function beginRun() {
    state.floor = 1;
    state.kills = 0;
    state.player.health = 100;
    state.gameOver = false;
    buildLevel(1);
    state.started = true;
    state.paused = false;
    lastTime = performance.now();
  }

  startBtn.addEventListener('click', () => {
    overlay.classList.add('hidden');
    beginRun();
    canvas.requestPointerLock();
  });

  // ---- Pause menu ----
  function pauseGame() {
    if (!state.started || state.gameOver || state.paused) return;
    state.paused = true;
    pauseMenu.classList.remove('hidden');
    pauseMenu.setAttribute('aria-hidden', 'false');
    if (document.pointerLockElement === canvas) document.exitPointerLock();
  }

  function resumeGame() {
    if (!state.paused) return;
    state.paused = false;
    pauseMenu.classList.add('hidden');
    pauseMenu.setAttribute('aria-hidden', 'true');
    canvas.requestPointerLock();
  }

  pauseResumeBtn.addEventListener('click', resumeGame);
  pauseRestartBtn.addEventListener('click', () => {
    pauseMenu.classList.add('hidden');
    pauseMenu.setAttribute('aria-hidden', 'true');
    beginRun();
    canvas.requestPointerLock();
  });
  pauseTitleBtn.addEventListener('click', () => {
    pauseMenu.classList.add('hidden');
    pauseMenu.setAttribute('aria-hidden', 'true');
    state.started = false;
    state.paused = false;
    if (document.pointerLockElement === canvas) document.exitPointerLock();
    showStartOverlay();
  });

  document.addEventListener('pointerlockchange', () => {
    if (document.pointerLockElement !== canvas && state.started && !state.paused && !state.gameOver) {
      pauseGame();
    }
  });

  // ---- Input ----
  window.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    state.keysHeld[k] = true;
    if (e.code === 'Space') {
      e.preventDefault();
      shoot();
    }
    if (k === 'm') {
      settings.paths = !settings.paths;
      pathsCheckbox.checked = settings.paths;
      saveSettings();
    }
    if (k === 'p') {
      if (state.paused) resumeGame();
      else pauseGame();
    }
  });
  window.addEventListener('keyup', (e) => {
    state.keysHeld[e.key.toLowerCase()] = false;
  });

  canvas.addEventListener('click', () => {
    if (!state.started || state.paused || state.gameOver) return;
    if (document.pointerLockElement !== canvas) {
      canvas.requestPointerLock();
    } else {
      shoot();
    }
  });

  document.addEventListener('mousemove', (e) => {
    if (document.pointerLockElement === canvas && state.started && !state.paused && !state.gameOver) {
      const dir = settings.invertLook ? -1 : 1;
      state.player.angle += e.movementX * settings.sensitivity * dir;
    }
  });

  function tryMove(p, dx, dy) {
    const tiles = state.tiles;
    const r = 0.2;
    const nx = p.x + dx;
    if (tileFree(tiles, Math.floor(nx + (dx > 0 ? r : -r)), Math.floor(p.y))) p.x = nx;
    const ny = p.y + dy;
    if (tileFree(tiles, Math.floor(p.x), Math.floor(ny + (dy > 0 ? r : -r)))) p.y = ny;
  }

  function lineClear(x0, y0, x1, y1) {
    const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 8));
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const x = x0 + (x1 - x0) * t;
      const y = y0 + (y1 - y0) * t;
      if (!tileFree(state.tiles, Math.floor(x), Math.floor(y))) return false;
    }
    return true;
  }

  // ---- FX helpers: remove + reflow + re-add so rapid repeats restart the animation ----
  function pulse(el, cls, duration) {
    el.classList.remove(cls);
    void el.offsetWidth; // force reflow
    el.classList.add(cls);
    if (duration) setTimeout(() => el.classList.remove(cls), duration);
  }

  function flashDamage() {
    pulse(damageFlashEl, 'hit', 160);
  }

  function fireWeaponFx() {
    pulse(weaponEl, 'recoil', 90);
    pulse(muzzleEl, 'flash', 90);
  }

  function shoot() {
    if (!state.started || state.paused || state.gameOver) return;
    fireWeaponFx();
    const p = state.player;
    let bestEnemy = null;
    let bestDist = Infinity;
    for (const e of state.enemies) {
      if (!e.alive) continue;
      const dx = e.x - p.x;
      const dy = e.y - p.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 8) continue;
      let diff = Math.atan2(dy, dx) - p.angle;
      while (diff > Math.PI) diff -= 2 * Math.PI;
      while (diff < -Math.PI) diff += 2 * Math.PI;
      if (Math.abs(diff) < 0.15 && dist < bestDist && lineClear(p.x, p.y, e.x, e.y)) {
        bestDist = dist;
        bestEnemy = e;
      }
    }
    if (bestEnemy) {
      bestEnemy.health -= 20;
      if (bestEnemy.health <= 0) {
        bestEnemy.alive = false;
        state.kills++;
      }
    }
  }

  function update(dt) {
    const p = state.player;

    if (state.keysHeld['arrowleft']) p.angle -= settings.turnSpeed * dt;
    if (state.keysHeld['arrowright']) p.angle += settings.turnSpeed * dt;

    const moveSpeed = 2.6 * dt;
    let dx = 0, dy = 0;
    if (state.keysHeld['w']) { dx += Math.cos(p.angle) * moveSpeed; dy += Math.sin(p.angle) * moveSpeed; }
    if (state.keysHeld['s']) { dx -= Math.cos(p.angle) * moveSpeed; dy -= Math.sin(p.angle) * moveSpeed; }
    if (state.keysHeld['a']) { dx += Math.cos(p.angle - Math.PI / 2) * moveSpeed; dy += Math.sin(p.angle - Math.PI / 2) * moveSpeed; }
    if (state.keysHeld['d']) { dx += Math.cos(p.angle + Math.PI / 2) * moveSpeed; dy += Math.sin(p.angle + Math.PI / 2) * moveSpeed; }
    tryMove(p, dx, dy);

    for (const pk of state.pickups) {
      if (pk.taken) continue;
      if (dist2(pk, p) < 0.3) {
        pk.taken = true;
        if (pk.type === 'key') p.keys++;
        else p.health = Math.min(100, p.health + 30);
      }
    }

    if (p.keys >= p.requiredKeys && dist2(state.exit, p) < 0.4) {
      state.floor++;
      buildLevel(state.floor);
      return;
    }

    const now = performance.now();
    for (const e of state.enemies) {
      if (!e.alive) continue;
      if (now >= e.repathAt || !e.path) {
        e.path = AStar.find(state.tiles, Math.floor(e.x), Math.floor(e.y), Math.floor(p.x), Math.floor(p.y));
        e.pathIndex = 1; // skip the tile the enemy is already standing on
        e.repathAt = now + 350 + Math.random() * 250;
      }
      if (e.path && e.pathIndex < e.path.length) {
        const wp = e.path[e.pathIndex];
        const tx = wp.x + 0.5, ty = wp.y + 0.5;
        const ddx = tx - e.x, ddy = ty - e.y;
        const d = Math.hypot(ddx, ddy);
        const speed = e.baseSpeed * settings.enemySpeed;
        if (d < 0.15) {
          e.pathIndex++;
        } else {
          e.x += (ddx / d) * speed * dt;
          e.y += (ddy / d) * speed * dt;
        }
      }
      if (dist2(e, p) < 0.55 && e.cooldown <= 0) {
        p.health -= 8;
        e.cooldown = 1.0;
        flashDamage();
      }
      if (e.cooldown > 0) e.cooldown -= dt;
    }

    if (p.health <= 0) {
      p.health = 0;
      state.gameOver = true;
      if (document.pointerLockElement === canvas) document.exitPointerLock();
      showGameOverOverlay();
    }
  }

  function draw() {
    if (!state.tiles) return;

    const sprites = [];
    for (const e of state.enemies) {
      if (e.alive) sprites.push({ x: e.x, y: e.y, color: '#eaf3ff', scale: 1, ghost: true });
    }
    for (const pk of state.pickups) {
      if (!pk.taken) {
        sprites.push({
          x: pk.x, y: pk.y,
          color: pk.type === 'key' ? '#ffd23f' : '#3fbf5f',
          scale: 0.5,
        });
      }
    }
    sprites.push({ x: state.exit.x, y: state.exit.y, color: '#39c8ff', scale: 1.3 });

    Raycaster.render(ctx, W, H, state.tiles, state.tw, state.th, state.player, sprites);
    if (settings.minimap) drawMinimap();
    drawHUD();
  }

  function drawMinimap() {
    const tiles = state.tiles, tw = state.tw, th = state.th;
    const size = minimapCanvas.width;
    const scale = size / Math.max(tw, th);
    mctx.clearRect(0, 0, size, size);
    mctx.fillStyle = 'rgba(10,10,15,0.7)';
    mctx.fillRect(0, 0, size, size);

    for (let y = 0; y < th; y++) {
      for (let x = 0; x < tw; x++) {
        mctx.fillStyle = tiles[y][x] === 1 ? '#333844' : '#8a8f9c';
        mctx.fillRect(x * scale, y * scale, scale, scale);
      }
    }

    if (settings.paths) {
      mctx.strokeStyle = '#ff5050';
      mctx.lineWidth = 1;
      for (const e of state.enemies) {
        if (!e.alive || !e.path) continue;
        mctx.beginPath();
        mctx.moveTo(e.x * scale, e.y * scale);
        for (let i = e.pathIndex; i < e.path.length; i++) {
          mctx.lineTo((e.path[i].x + 0.5) * scale, (e.path[i].y + 0.5) * scale);
        }
        mctx.stroke();
      }
    }

    for (const e of state.enemies) {
      if (!e.alive) continue;
      mctx.fillStyle = '#e33333';
      mctx.beginPath();
      mctx.arc(e.x * scale, e.y * scale, 2.5, 0, Math.PI * 2);
      mctx.fill();
    }
    for (const pk of state.pickups) {
      if (pk.taken) continue;
      mctx.fillStyle = pk.type === 'key' ? '#ffd23f' : '#3fbf5f';
      mctx.beginPath();
      mctx.arc(pk.x * scale, pk.y * scale, 2, 0, Math.PI * 2);
      mctx.fill();
    }
    mctx.fillStyle = '#39c8ff';
    mctx.beginPath();
    mctx.arc(state.exit.x * scale, state.exit.y * scale, 3, 0, Math.PI * 2);
    mctx.fill();

    const p = state.player;
    mctx.fillStyle = '#fff';
    mctx.beginPath();
    mctx.arc(p.x * scale, p.y * scale, 3, 0, Math.PI * 2);
    mctx.fill();
    mctx.strokeStyle = '#fff';
    mctx.beginPath();
    mctx.moveTo(p.x * scale, p.y * scale);
    mctx.lineTo((p.x + Math.cos(p.angle) * 1.6) * scale, (p.y + Math.sin(p.angle) * 1.6) * scale);
    mctx.stroke();
  }

  function drawHUD() {
    hudFloor.textContent = state.floor;
    hudHp.textContent = Math.max(0, Math.round(state.player.health));
    hudKills.textContent = state.kills;
    hudKeys.textContent = `${state.player.keys}/${state.player.requiredKeys}`;
  }

  let lastTime = performance.now();
  function loop(now) {
    const dt = Math.min(0.05, (now - lastTime) / 1000);
    lastTime = now;
    if (state.started && !state.paused && !state.gameOver) update(dt);
    draw();
    requestAnimationFrame(loop);
  }

  // ---- Boot ----
  loadSettings();
  applySettingsToUI();
  buildLevel(1); // pre-render a level behind the start overlay
  showStartOverlay();
  requestAnimationFrame(loop);
})();
