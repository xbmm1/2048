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

  // ---- Sky ----
  // Procedural 360 backdrop (gradient + stars + distant silhouette) used by
  // default; drop a real equirectangular photo at assets/sky.jpg and it will
  // be swapped in automatically once it finishes loading.
  const proceduralSky = document.createElement('canvas');
  proceduralSky.width = 2048;
  proceduralSky.height = 300;
  (function paintProceduralSky() {
    const sctx = proceduralSky.getContext('2d');
    const w = proceduralSky.width, h = proceduralSky.height;
    const grad = sctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#05060c');
    grad.addColorStop(0.55, '#141827');
    grad.addColorStop(1, '#486379');
    sctx.fillStyle = grad;
    sctx.fillRect(0, 0, w, h);

    let seed = 1337;
    function rand() { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return (seed % 10000) / 10000; }
    for (let i = 0; i < 500; i++) {
      const sx = rand() * w, sy = rand() * h * 0.7;
      const r = rand() * 1.2 + 0.2;
      sctx.globalAlpha = 0.4 + rand() * 0.6;
      sctx.fillStyle = '#ffffff';
      sctx.beginPath();
      sctx.arc(sx, sy, r, 0, Math.PI * 2);
      sctx.fill();
    }
    sctx.globalAlpha = 1;

    sctx.fillStyle = '#024202';
    sctx.beginPath();
    sctx.moveTo(0, h);
    let py = h * 0.78;
    for (let x = 0; x <= w; x += 24) {
      py += (rand() - 0.5) * 18;
      py = Math.max(h * 0.80, Math.min(h * 0.88, py));
      sctx.lineTo(x, py);
    }
    sctx.lineTo(w, h);
    sctx.closePath();
    sctx.fill();
  })();

  let activeSky = proceduralSky;
  const customSky = new Image();
  customSky.onload = () => {
    if (customSky.naturalWidth > 0) activeSky = customSky;
  };
  customSky.src = 'assets/sky.jpg';

  // ---- Wall textures ----
  // Each wall tile gets a stable-but-random pick from this set (based on its
  // grid coordinates), so the maze walls read as a varied stone/brick mix
  // instead of a single repeating pattern.
  const WALL_TEXTURE_FILES = ['tile065.png', 'tile066.png', 'tile067.png', 'tile068.png', 'tile069.png', 'tile070.png'];
  const wallTextures = WALL_TEXTURE_FILES.map((name) => {
    const img = new Image();
    img.src = `assets/${name}`;
    return img;
  });

  // ---- Per-floor themes ----
  // Walls/floor/ceiling/sky gradually shift from warm brick to cold, icy
  // tones the deeper the player descends, for a sense of progression.
  const lerp = (a, b, t) => a + (b - a) * t;
  const lerpColor = (c1, c2, t) => [
    lerp(c1[0], c2[0], t) | 0,
    lerp(c1[1], c2[1], t) | 0,
    lerp(c1[2], c2[2], t) | 0,
  ];
  const WARM_WALL_A = [150, 90, 60];
  const WARM_WALL_B = [126, 74, 48];
  const COLD_WALL_A = [70, 95, 135];
  const COLD_WALL_B = [50, 68, 105];
  const WARM_FLOOR = [38, 36, 26];
  const COLD_FLOOR = [16, 22, 36];
  const WARM_CEIL = [21, 21, 29];
  const COLD_CEIL = [8, 11, 22];

  function themeForFloor(floorNum) {
    const t = Math.min(1, (floorNum - 1) / 9);
    const floorC = lerpColor(WARM_FLOOR, COLD_FLOOR, t);
    const ceilC = lerpColor(WARM_CEIL, COLD_CEIL, t);
    const tintAlpha = t * 0.35;
    return {
      wallA: lerpColor(WARM_WALL_A, COLD_WALL_A, t),
      wallB: lerpColor(WARM_WALL_B, COLD_WALL_B, t),
      floorColor: `rgb(${floorC[0]},${floorC[1]},${floorC[2]})`,
      ceilingFallback: `rgb(${ceilC[0]},${ceilC[1]},${ceilC[2]})`,
      skyTint: tintAlpha > 0.02 ? `rgba(60,90,160,${tintAlpha.toFixed(2)})` : null,
    };
  }

  // ---- UI elements ----
  const hudFloor = document.getElementById('floor');
  const hudHp = document.getElementById('hp');
  const hudKills = document.getElementById('kills');
  const hudKeys = document.getElementById('keys');

  const crosshairEl = document.getElementById('crosshair');
  const damageFlashEl = document.getElementById('damage-flash');
  const weaponEl = document.getElementById('weapon');
  const powerupStatusEl = document.getElementById('powerup-status');

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
  const enemyCountInput = document.getElementById('setting-enemy-count');
  const enemyCountValue = document.getElementById('setting-enemy-count-value');
  const enemyHealthInput = document.getElementById('setting-enemy-health');
  const enemyHealthValue = document.getElementById('setting-enemy-health-value');
  const minimapCheckbox = document.getElementById('setting-minimap');
  const pathsCheckbox = document.getElementById('setting-paths');
  const fogCheckbox = document.getElementById('setting-fog');
  const crosshairCheckbox = document.getElementById('setting-crosshair');
  const invertLookCheckbox = document.getElementById('setting-invert-look');
  const settingsResetBtn = document.getElementById('setting-reset');

  // ---- Settings (persisted) ----
  const SETTINGS_KEY = 'dungeonCrawlerSettings';
  const DEFAULT_SETTINGS = {
    sensitivity: 0.0025,
    turnSpeed: 2.6,
    enemySpeed: 1.0,
    enemyCountMult: 1.0,
    enemyHealthMult: 1.0,
    minimap: true,
    paths: false,
    fogOfWar: false,
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
    enemyCountInput.value = settings.enemyCountMult;
    enemyCountValue.textContent = settings.enemyCountMult.toFixed(1) + 'x';
    enemyHealthInput.value = settings.enemyHealthMult;
    enemyHealthValue.textContent = settings.enemyHealthMult.toFixed(1) + 'x';
    minimapCheckbox.checked = settings.minimap;
    pathsCheckbox.checked = settings.paths;
    fogCheckbox.checked = settings.fogOfWar;
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
  enemyCountInput.addEventListener('input', () => {
    settings.enemyCountMult = parseFloat(enemyCountInput.value);
    enemyCountValue.textContent = settings.enemyCountMult.toFixed(1) + 'x';
    saveSettings();
  });
  enemyHealthInput.addEventListener('input', () => {
    settings.enemyHealthMult = parseFloat(enemyHealthInput.value);
    enemyHealthValue.textContent = settings.enemyHealthMult.toFixed(1) + 'x';
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
  fogCheckbox.addEventListener('change', () => {
    settings.fogOfWar = fogCheckbox.checked;
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

  // ---- Power-ups ----
  const POWERUP_DURATIONS = { speed: 8, damage: 10, invincible: 10 };
  const POWERUP_TYPES = ['speed', 'damage', 'invincible'];
  const POWERUP_COLORS = { speed: '#4dd0ff', damage: '#ff7043', invincible: '#95ff4f' };
  const POWERUP_LABELS = { speed: 'SPEED', damage: 'DAMAGE', invincible: 'INVINCIBLE' };

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
    player: {
      x: 1.5, y: 1.5, angle: 0, health: 100, keys: 0, requiredKeys: 1,
      effects: { speed: 0, damage: 0, invincible: 0 },
    },
    enemies: [],
    pickups: [],
    exit: null,
    keysHeld: {},
    projectiles: [],
    visited: null,
    theme: null,
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
    state.theme = themeForFloor(floorNum);
    state.visited = Array.from({ length: h }, () => new Array(w).fill(false));
    state.projectiles = [];

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

    const powerupCount = 1 + Math.floor(floorNum / 3);
    for (let i = 0; i < powerupCount; i++) {
      const c = randomFloorCell(tiles, w, h);
      const sub = POWERUP_TYPES[Math.floor(Math.random() * POWERUP_TYPES.length)];
      state.pickups.push({ type: 'powerup', sub, x: c.x + 0.5, y: c.y + 0.5, taken: false });
    }

    state.enemies = [];
    const enemyCount = Math.max(1, Math.round((2 + floorNum) * settings.enemyCountMult));
    for (let i = 0; i < enemyCount; i++) {
      const c = randomFloorCell(tiles, w, h);
      const ranged = Math.random() < Math.min(0.55, 0.25 + floorNum * 0.03);
      state.enemies.push({
        x: c.x + 0.5,
        y: c.y + 0.5,
        health: 30 * settings.enemyHealthMult,
        baseSpeed: 1.25 + floorNum * 0.08,
        path: null,
        pathIndex: 1,
        repathAt: 0,
        cooldown: 0,
        alive: true,
        ranged,
        shootCooldown: Math.random() * 1.2,
        hitFlash: 0,
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
    state.player.effects = { speed: 0, damage: 0, invincible: 0 };
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
    pulse(weaponEl, 'firing', 300);
  }

  function shoot() {
    if (!state.started || state.paused || state.gameOver) return;
    fireWeaponFx();
    const p = state.player;
    const dmgMult = p.effects.damage > 0 ? 2 : 1;
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
      bestEnemy.health -= 20 * dmgMult;
      bestEnemy.hitFlash = 1;
      if (bestEnemy.health <= 0) {
        bestEnemy.alive = false;
        state.kills++;
      }
    }
  }

  function applyPowerup(sub) {
    state.player.effects[sub] = POWERUP_DURATIONS[sub];
  }

  function update(dt) {
    const p = state.player;

    for (const k in p.effects) {
      if (p.effects[k] > 0) p.effects[k] = Math.max(0, p.effects[k] - dt);
    }

    if (state.keysHeld['arrowleft']) p.angle -= settings.turnSpeed * dt;
    if (state.keysHeld['arrowright']) p.angle += settings.turnSpeed * dt;

    const speedMult = p.effects.speed > 0 ? 1.5 : 1;
    const moveSpeed = 2.6 * speedMult * dt;
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
        else if (pk.type === 'health') p.health = Math.min(100, p.health + 30);
        else if (pk.type === 'powerup') {
          applyPowerup(pk.sub);
        }
      }
    }

    if (p.keys >= p.requiredKeys && dist2(state.exit, p) < 0.4) {
      state.floor++;
      buildLevel(state.floor);
      return;
    }

    const now = performance.now();
    for (const e of state.enemies) {
      if (e.hitFlash > 0) e.hitFlash = Math.max(0, e.hitFlash - dt / 0.25);
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
      if (e.cooldown > 0) e.cooldown -= dt;

      if (e.ranged) {
        if (e.shootCooldown > 0) e.shootCooldown -= dt;
        const rdx = p.x - e.x, rdy = p.y - e.y;
        const rdist = Math.hypot(rdx, rdy);
        if (e.shootCooldown <= 0 && rdist <= 6 && rdist > 0.6 && lineClear(e.x, e.y, p.x, p.y)) {
          state.projectiles.push({
            x: e.x, y: e.y,
            dx: rdx / rdist, dy: rdy / rdist,
            speed: 3.2,
            damage: 12,
            life: 3,
          });
          e.shootCooldown = 1.6 + Math.random() * 0.6;
        }
      } else if (dist2(e, p) < 0.55 && e.cooldown <= 0) {
        e.cooldown = 1.0;
        if (p.effects.invincible <= 0) {
          p.health -= 8;
          flashDamage();
        }
      }
    }

    for (let i = state.projectiles.length - 1; i >= 0; i--) {
      const proj = state.projectiles[i];
      proj.x += proj.dx * proj.speed * dt;
      proj.y += proj.dy * proj.speed * dt;
      proj.life -= dt;
      let hit = false;
      if (proj.life <= 0 || !tileFree(state.tiles, Math.floor(proj.x), Math.floor(proj.y))) {
        hit = true;
      } else if (dist2(proj, p) < 0.2) {
        if (p.effects.invincible <= 0) {
          p.health -= proj.damage;
          flashDamage();
        }
        hit = true;
      }
      if (hit) state.projectiles.splice(i, 1);
    }

    revealAround(Math.floor(p.x), Math.floor(p.y), 5);

    if (p.health <= 0) {
      p.health = 0;
      state.gameOver = true;
      if (document.pointerLockElement === canvas) document.exitPointerLock();
      showGameOverOverlay();
    }
  }

  // ---- Fog of war ----
  function revealAround(cx, cy, radius) {
    const visited = state.visited;
    if (!visited) return;
    const y0 = Math.max(0, cy - radius), y1 = Math.min(state.th - 1, cy + radius);
    const x0 = Math.max(0, cx - radius), x1 = Math.min(state.tw - 1, cx + radius);
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        if ((x - cx) ** 2 + (y - cy) ** 2 <= radius * radius) visited[y][x] = true;
      }
    }
  }

  function draw() {
    if (!state.tiles) return;

    const sprites = [];
    for (const e of state.enemies) {
      if (e.alive) sprites.push({ x: e.x, y: e.y, color: e.ranged ? '#d9b3ff' : '#eaf3ff', scale: 1, ghost: true, flash: e.hitFlash });
    }
    for (const proj of state.projectiles) {
      sprites.push({ x: proj.x, y: proj.y, color: '#ff5fd6', scale: 0.22, bolt: true });
    }
    for (const pk of state.pickups) {
      if (!pk.taken) {
        sprites.push({
          x: pk.x, y: pk.y,
          color: pk.type === 'key' ? '#ffd23f'
            : pk.type === 'health' ? '#3fbf5f'
            : POWERUP_COLORS[pk.sub] || '#ffffff',
          scale: pk.type === 'powerup' ? 0.6 : 0.5,
          key: pk.type === 'key',
          health: pk.type === 'health',
        });
      }
    }
    sprites.push({ x: state.exit.x, y: state.exit.y, color: '#39c8ff', scale: 1.3, door: true });

    Raycaster.render(ctx, W, H, state.tiles, state.tw, state.th, state.player, sprites, activeSky, state.theme, wallTextures);
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
        if (settings.fogOfWar && !(state.visited && state.visited[y][x])) {
          mctx.fillStyle = '#050507';
          mctx.fillRect(x * scale, y * scale, scale, scale);
          continue;
        }
        mctx.fillStyle = tiles[y][x] === 1 ? '#333844' : '#8a8f9c';
        mctx.fillRect(x * scale, y * scale, scale, scale);
      }
    }

    const isRevealed = (wx, wy) => !settings.fogOfWar || (state.visited && state.visited[Math.floor(wy)] && state.visited[Math.floor(wy)][Math.floor(wx)]);

    if (settings.paths) {
      mctx.strokeStyle = '#ff5050';
      mctx.lineWidth = 1;
      for (const e of state.enemies) {
        if (!e.alive || !e.path || !isRevealed(e.x, e.y)) continue;
        mctx.beginPath();
        mctx.moveTo(e.x * scale, e.y * scale);
        for (let i = e.pathIndex; i < e.path.length; i++) {
          mctx.lineTo((e.path[i].x + 0.5) * scale, (e.path[i].y + 0.5) * scale);
        }
        mctx.stroke();
      }
    }

    for (const e of state.enemies) {
      if (!e.alive || !isRevealed(e.x, e.y)) continue;
      mctx.fillStyle = e.ranged ? '#c98bff' : '#e33333';
      mctx.beginPath();
      mctx.arc(e.x * scale, e.y * scale, 2.5, 0, Math.PI * 2);
      mctx.fill();
    }
    for (const proj of state.projectiles) {
      if (!isRevealed(proj.x, proj.y)) continue;
      mctx.fillStyle = '#ff5fd6';
      mctx.beginPath();
      mctx.arc(proj.x * scale, proj.y * scale, 1.4, 0, Math.PI * 2);
      mctx.fill();
    }
    for (const pk of state.pickups) {
      if (pk.taken || !isRevealed(pk.x, pk.y)) continue;
      const px = pk.x * scale, py = pk.y * scale;
      if (pk.type === 'key') {
        // Tiny key icon: a ring with a short stem.
        mctx.strokeStyle = '#ffd23f';
        mctx.lineWidth = 1;
        mctx.beginPath();
        mctx.arc(px, py - 1, 1.6, 0, Math.PI * 2);
        mctx.stroke();
        mctx.strokeStyle = '#ffd23f';
        mctx.beginPath();
        mctx.moveTo(px, py + 0.5);
        mctx.lineTo(px, py + 2.6);
        mctx.stroke();
      } else if (pk.type === 'health') {
        // Tiny health-pack icon: a small green square with a white cross.
        mctx.fillStyle = '#3fbf5f';
        mctx.fillRect(px - 2.5, py - 2.5, 5, 5);
        mctx.strokeStyle = '#1d3a24';
        mctx.lineWidth = 0.6;
        mctx.strokeRect(px - 2.5, py - 2.5, 5, 5);
        mctx.fillStyle = '#f4f4f0';
        mctx.fillRect(px - 0.5, py - 1.8, 1, 3.6);
        mctx.fillRect(px - 1.8, py - 0.5, 3.6, 1);
      } else if (pk.type === 'powerup') {
        // Tiny power-up icon: a small colored diamond.
        mctx.fillStyle = POWERUP_COLORS[pk.sub] || '#ffffff';
        mctx.beginPath();
        mctx.moveTo(px, py - 3);
        mctx.lineTo(px + 3, py);
        mctx.lineTo(px, py + 3);
        mctx.lineTo(px - 3, py);
        mctx.closePath();
        mctx.fill();
      }
    }
    // Exit door icon: a small bordered rectangle with a knob dot.
    const ex = state.exit.x * scale, ey = state.exit.y * scale;
    if (isRevealed(state.exit.x, state.exit.y)) {
      mctx.fillStyle = '#39c8ff';
      mctx.fillRect(ex - 3, ey - 4, 6, 8);
      mctx.strokeStyle = '#12262e';
      mctx.lineWidth = 1;
      mctx.strokeRect(ex - 3, ey - 4, 6, 8);
      mctx.fillStyle = '#ffe27a';
      mctx.fillRect(ex + 0.8, ey - 0.5, 1, 1);
    }

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

    const badges = [];
    for (const sub of ['speed', 'damage', 'invincible']) {
      const t = state.player.effects[sub];
      if (t > 0) badges.push(`<div class="powerup-badge ${sub}">${POWERUP_LABELS[sub]} ${t.toFixed(1)}s</div>`);
    }
    powerupStatusEl.innerHTML = badges.join('');
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
