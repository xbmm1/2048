(function () {
  const canvas = document.getElementById('scene');
  const minimapCanvas = document.getElementById('minimap');
  const ctx = canvas.getContext('2d');
  const miniCtx = minimapCanvas.getContext('2d');
  const overlay = document.getElementById('overlay');
  const startButton = document.getElementById('start-btn');
  const pauseMenu = document.getElementById('pause-menu');
  const pauseResume = document.getElementById('pause-resume');
  const pauseRestart = document.getElementById('pause-restart');
  const pauseTitle = document.getElementById('pause-title');
  const hudFloor = document.getElementById('floor');
  const hudHp = document.getElementById('hp');
  const hudKills = document.getElementById('kills');
  const hudKeys = document.getElementById('keys');
  const damageFlash = document.getElementById('damage-flash');
  const weapon = document.getElementById('weapon');
  const muzzle = document.getElementById('muzzle');
  const crosshair = document.getElementById('crosshair');
  const settingSensitivity = document.getElementById('setting-sensitivity');
  const settingTurnspeed = document.getElementById('setting-turnspeed');
  const settingEnemySpeed = document.getElementById('setting-enemy-speed');
  const settingMinimap = document.getElementById('setting-minimap');
  const settingPaths = document.getElementById('setting-paths');
  const settingCrosshair = document.getElementById('setting-crosshair');
  const settingInvertLook = document.getElementById('setting-invert-look');
  const settingSensitivityValue = document.getElementById('setting-sensitivity-value');
  const settingTurnspeedValue = document.getElementById('setting-turnspeed-value');
  const settingEnemySpeedValue = document.getElementById('setting-enemy-speed-value');
  const settingReset = document.getElementById('setting-reset');

  const state = {
    tiles: [],
    player: null,
    enemies: [],
    items: [],
    exit: null,
    floor: 1,
    keys: 0,
    kills: 0,
    running: false,
    paused: false,
    showMinimap: true,
    showPaths: false,
    showCrosshair: true,
    invertLook: false,
    sensitivity: 0.0026,
    turnSpeed: 2.8,
    enemySpeed: 1.1,
    lastTime: 0,
    recoil: 0,
    shootCooldown: 0,
    flashTimer: 0,
    keysPressed: {}
  };

  function resetSettings() {
    state.sensitivity = 0.0026;
    state.turnSpeed = 2.8;
    state.enemySpeed = 1.1;
    state.showMinimap = true;
    state.showPaths = false;
    state.showCrosshair = true;
    state.invertLook = false;
    applySettingsUI();
  }

  function applySettingsUI() {
    settingSensitivity.value = state.sensitivity;
    settingTurnspeed.value = state.turnSpeed;
    settingEnemySpeed.value = state.enemySpeed;
    settingMinimap.checked = state.showMinimap;
    settingPaths.checked = state.showPaths;
    settingCrosshair.checked = state.showCrosshair;
    settingInvertLook.checked = state.invertLook;
    settingSensitivityValue.textContent = state.sensitivity.toFixed(4);
    settingTurnspeedValue.textContent = state.turnSpeed.toFixed(1);
    settingEnemySpeedValue.textContent = state.enemySpeed.toFixed(2);
    crosshair.style.display = state.showCrosshair ? 'block' : 'none';
  }

  function updateHud() {
    hudFloor.textContent = state.floor;
    const hp = state.player ? Math.max(0, Math.round(state.player.health)) : 100;
    hudHp.textContent = hp;
    hudKills.textContent = state.kills;
    hudKeys.textContent = state.keys;
  }

  function createFallbackTiles(cols, rows) {
    const tileRows = rows * 2 + 1;
    const tileCols = cols * 2 + 1;
    const tiles = Array.from({ length: tileRows }, () => Array(tileCols).fill(1));
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        tiles[y * 2 + 1][x * 2 + 1] = 0;
      }
    }
    return tiles;
  }

  function isBlocked(x, y) {
    if (!state.tiles || !state.tiles.length || !state.tiles[0].length) return true;
    const tx = Math.floor(x);
    const ty = Math.floor(y);
    if (tx < 0 || ty < 0 || ty >= state.tiles.length || tx >= state.tiles[0].length) return true;
    return state.tiles[ty][tx] === 1;
  }

  function pickWalkableTile() {
    const floors = [];
    if (!state.tiles || !state.tiles.length || !state.tiles[0].length) {
      return null;
    }
    for (let y = 0; y < state.tiles.length; y++) {
      for (let x = 0; x < state.tiles[0].length; x++) {
        if (state.tiles[y][x] === 0) floors.push({ x, y });
      }
    }
    if (!floors.length) {
      return { x: 1, y: 1 };
    }
    return floors[Math.floor(Math.random() * floors.length)];
  }

  function setPlayerDirection() {
    const angle = state.player.angle;
    state.player.dirX = Math.cos(angle);
    state.player.dirY = Math.sin(angle);
    state.player.planeX = -Math.sin(angle) * 0.66;
    state.player.planeY = Math.cos(angle) * 0.66;
  }

  function buildLevel() {
    let maze = null;
    if (typeof Maze !== 'undefined' && Maze && typeof Maze.generateMaze === 'function') {
      maze = Maze.generateMaze(11 + state.floor, 9 + state.floor);
    }
    state.tiles = maze && maze.tiles ? maze.tiles : createFallbackTiles(11 + state.floor, 9 + state.floor);
    const spawn = pickWalkableTile();
    if (!spawn) {
      state.tiles = createFallbackTiles(11 + state.floor, 9 + state.floor);
      state.player = {
        x: 1.5,
        y: 1.5,
        angle: 0,
        dirX: 1,
        dirY: 0,
        planeX: 0,
        planeY: 0.66,
        speed: 0.06,
        health: 100,
        radius: 0.2
      };
      setPlayerDirection();
      state.exit = { x: 1.5, y: 1.5, kind: 'exit' };
      state.enemies = [];
      state.items = [];
      state.keys = 0;
      state.kills = 0;
      state.shootCooldown = 0;
      updateHud();
      return;
    }
    state.player = {
      x: spawn.x + 0.5,
      y: spawn.y + 0.5,
      angle: Math.random() * Math.PI * 2,
      dirX: 1,
      dirY: 0,
      planeX: 0,
      planeY: 0.66,
      speed: 0.06,
      health: 100,
      radius: 0.2
    };
    setPlayerDirection();

    const farthest = (typeof Maze !== 'undefined' && Maze && typeof Maze.findFarthestTile === 'function')
      ? Maze.findFarthestTile(state.tiles, spawn.x, spawn.y)
      : { x: spawn.x, y: spawn.y };
    state.exit = { x: farthest.x + 0.5, y: farthest.y + 0.5, kind: 'exit' };
    state.enemies = [];
    state.items = [];
    state.keys = 0;
    state.kills = 0;
    state.shootCooldown = 0;
    const enemyCount = 2 + state.floor;
    for (let i = 0; i < enemyCount; i++) {
      const tile = pickWalkableTile();
      if (Math.abs(tile.x - spawn.x) < 3 && Math.abs(tile.y - spawn.y) < 3) continue;
      state.enemies.push({
        x: tile.x + 0.5,
        y: tile.y + 0.5,
        alive: true,
        hp: 100,
        speed: 0.025 * (1 + state.floor * 0.1) * state.enemySpeed,
        path: null,
        pathIndex: 0,
        repathAt: 0,
        cooldown: 0,
        hurt: false
      });
    }

    state.items.push({ kind: 'key', x: spawn.x + 0.6, y: spawn.y + 0.3 });
    if (state.floor > 1) {
      state.items.push({ kind: 'health', x: farthest.x + 0.3, y: farthest.y + 0.7 });
    }
    updateHud();
  }

  function lineClear(fromX, fromY, toX, toY) {
    const dx = toX - fromX;
    const dy = toY - fromY;
    const steps = Math.max(Math.abs(dx), Math.abs(dy)) * 2;
    for (let i = 1; i < steps; i++) {
      const px = fromX + dx * (i / steps);
      const py = fromY + dy * (i / steps);
      if (isBlocked(px, py)) return false;
    }
    return true;
  }

  function shoot() {
    if (!state.player || !state.running || state.paused) return;
    if (state.shootCooldown > 0) return;
    state.shootCooldown = 0.25;
    muzzle.classList.remove('flash');
    void muzzle.offsetWidth;
    muzzle.classList.add('flash');
    weapon.classList.add('recoil');
    setTimeout(() => weapon.classList.remove('recoil'), 70);

    const aimX = Math.cos(state.player.angle);
    const aimY = Math.sin(state.player.angle);
    let best = null;
    let bestDist2 = Infinity;

    for (const enemy of state.enemies) {
      if (!enemy.alive) continue;
      const dx = enemy.x - state.player.x;
      const dy = enemy.y - state.player.y;
      const dist2 = dx * dx + dy * dy;
      if (dist2 > 9) continue;
      const dot = dx * aimX + dy * aimY;
      const cross = dx * aimY - dy * aimX;
      if (dot <= 0 || Math.abs(cross) > 0.25) continue;
      if (!lineClear(state.player.x, state.player.y, enemy.x, enemy.y)) continue;
      if (dist2 < bestDist2) {
        bestDist2 = dist2;
        best = enemy;
      }
    }

    if (best) {
      best.hp -= 35;
      best.hurt = true;
      setTimeout(() => { best.hurt = false; }, 80);
      best.x += aimX * 0.15;
      best.y += aimY * 0.15;
      if (best.hp <= 0) {
        best.alive = false;
        state.kills += 1;
        updateHud();
      }
    }
  }

  function updateEnemy(enemy, dt) {
    if (!enemy.alive) return;
    const now = performance.now();
    if (now >= enemy.repathAt || !enemy.path) {
      const path = AStar.find(state.tiles, Math.floor(enemy.x), Math.floor(enemy.y), Math.floor(state.player.x), Math.floor(state.player.y));
      if (path && path.length > 1) {
        enemy.path = path;
        enemy.pathIndex = 1;
      } else {
        enemy.path = null;
        enemy.pathIndex = 0;
      }
      enemy.repathAt = now + 350 + Math.random() * 250;
    }

    if (!enemy.path || enemy.pathIndex >= enemy.path.length) {
      enemy.path = null;
      return;
    }

    const target = enemy.path[enemy.pathIndex];
    const tx = target.x + 0.5;
    const ty = target.y + 0.5;
    const dx = tx - enemy.x;
    const dy = ty - enemy.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 0.08) {
      enemy.pathIndex += 1;
      return;
    }
    const step = Math.min(enemy.speed * dt * 60, dist);
    enemy.x += (dx / dist) * step;
    enemy.y += (dy / dist) * step;

    if (Math.hypot(enemy.x - state.player.x, enemy.y - state.player.y) < 0.45 && enemy.cooldown <= 0) {
      state.player.health -= 7;
      state.player.x -= (enemy.x - state.player.x) * 0.14;
      state.player.y -= (enemy.y - state.player.y) * 0.14;
      enemy.cooldown = 0.8;
      damageFlash.classList.add('hit');
      setTimeout(() => damageFlash.classList.remove('hit'), 110);
      updateHud();
    }
    enemy.cooldown = Math.max(0, enemy.cooldown - dt);
  }

  function update(dt) {
    if (!state.running || state.paused || !state.player || !state.tiles || !state.tiles.length) return;
    state.shootCooldown = Math.max(0, state.shootCooldown - dt);

    const forwardInput = (state.keysPressed['w'] ? 1 : 0) - (state.keysPressed['s'] ? 1 : 0);
    const strafeInput = (state.keysPressed['d'] ? 1 : 0) - (state.keysPressed['a'] ? 1 : 0);
    if (forwardInput || strafeInput) {
      const dirX = state.player.dirX;
      const dirY = state.player.dirY;
      const moveX = forwardInput * dirX + strafeInput * (-dirY);
      const moveY = forwardInput * dirY + strafeInput * dirX;
      const len = Math.hypot(moveX, moveY) || 1;
      const moveNormX = moveX / len;
      const moveNormY = moveY / len;
      const nx = state.player.x + moveNormX * state.player.speed * dt * 60;
      const ny = state.player.y + moveNormY * state.player.speed * dt * 60;
      if (!isBlocked(nx, state.player.y)) state.player.x = nx;
      if (!isBlocked(state.player.x, ny)) state.player.y = ny;
    }

    for (const enemy of state.enemies) updateEnemy(enemy, dt);

    for (const item of state.items) {
      if (Math.hypot(item.x - state.player.x, item.y - state.player.y) < 0.4) {
        if (item.kind === 'key') {
          state.keys += 1;
          updateHud();
        } else if (item.kind === 'health') {
          state.player.health = Math.min(100, state.player.health + 25);
          updateHud();
        }
        item.collected = true;
      }
    }
    state.items = state.items.filter((item) => !item.collected);

    if (state.player.health <= 0) {
      state.paused = true;
      pauseMenu.classList.remove('hidden');
      pauseMenu.setAttribute('aria-hidden', 'false');
    }

    if (state.exit && Math.hypot(state.exit.x - state.player.x, state.exit.y - state.player.y) < 0.55 && state.keys >= 1) {
      state.floor += 1;
      buildLevel();
    }
  }

  function render() {
    Raycaster.renderScene(state, ctx, canvas);
    renderMinimap();
  }

  function renderMinimap() {
    if (!state.showMinimap) {
      miniCtx.clearRect(0, 0, minimapCanvas.width, minimapCanvas.height);
      return;
    }
    const w = state.tiles[0].length;
    const h = state.tiles.length;
    const cell = 180 / Math.max(w, h);
    miniCtx.clearRect(0, 0, minimapCanvas.width, minimapCanvas.height);
    miniCtx.fillStyle = 'rgba(0,0,0,0.75)';
    miniCtx.fillRect(0, 0, minimapCanvas.width, minimapCanvas.height);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        miniCtx.fillStyle = state.tiles[y][x] === 1 ? '#262b39' : '#d6d9e4';
        miniCtx.fillRect(x * cell + 2, y * cell + 2, cell - 2, cell - 2);
      }
    }
    miniCtx.fillStyle = '#ff5252';
    miniCtx.fillRect(state.player.x * cell + 2, state.player.y * cell + 2, 4, 4);
    for (const enemy of state.enemies) {
      if (!enemy.alive) continue;
      miniCtx.fillStyle = '#ff8a65';
      miniCtx.fillRect(enemy.x * cell + 2, enemy.y * cell + 2, 4, 4);
      if (state.showPaths && enemy.path) {
        miniCtx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
        miniCtx.beginPath();
        miniCtx.moveTo(enemy.x * cell + 4, enemy.y * cell + 4);
        for (const point of enemy.path) {
          miniCtx.lineTo(point.x * cell + 4, point.y * cell + 4);
        }
        miniCtx.stroke();
      }
    }
    if (state.exit) {
      miniCtx.fillStyle = '#55ffcd';
      miniCtx.fillRect(state.exit.x * cell + 2, state.exit.y * cell + 2, 4, 4);
    }
  }

  function animate(timestamp) {
    if (!state.lastTime) state.lastTime = timestamp;
    const dt = Math.min(0.025, (timestamp - state.lastTime) / 1000);
    state.lastTime = timestamp;
    update(dt);
    render();
    requestAnimationFrame(animate);
  }

  function handleKeydown(event) {
    const key = event.key.toLowerCase();
    if (key === 'p') {
      state.paused = !state.paused;
      pauseMenu.classList.toggle('hidden', !state.paused);
      pauseMenu.setAttribute('aria-hidden', String(!state.paused));
    }
    if (!state.player) return;
    state.keysPressed[key] = true;
    if (key === 'm') state.showPaths = !state.showPaths;
  }

  function handleKeyup(event) {
    state.keysPressed[event.key.toLowerCase()] = false;
  }

  function startGame() {
    state.running = true;
    state.paused = false;
    overlay.classList.add('hidden');
    pauseMenu.classList.add('hidden');
    pauseMenu.setAttribute('aria-hidden', 'true');
    buildLevel();
    requestAnimationFrame(animate);
  }

  startButton.addEventListener('click', startGame);
  pauseResume.addEventListener('click', () => {
    state.paused = false;
    pauseMenu.classList.add('hidden');
    pauseMenu.setAttribute('aria-hidden', 'true');
  });
  pauseRestart.addEventListener('click', () => {
    state.paused = false;
    buildLevel();
    pauseMenu.classList.add('hidden');
    pauseMenu.setAttribute('aria-hidden', 'true');
  });
  pauseTitle.addEventListener('click', () => {
    state.running = false;
    overlay.classList.remove('hidden');
    pauseMenu.classList.add('hidden');
    pauseMenu.setAttribute('aria-hidden', 'true');
  });

  canvas.addEventListener('click', () => {
    if (!state.player || !state.running || state.paused) return;
    if (document.pointerLockElement !== canvas) canvas.requestPointerLock();
    shoot();
  });
  document.addEventListener('pointerlockchange', () => {
    if (document.pointerLockElement !== canvas) {
      state.paused = true;
      pauseMenu.classList.remove('hidden');
      pauseMenu.setAttribute('aria-hidden', 'false');
    }
  });
  document.addEventListener('mousemove', (event) => {
    if (!state.player || document.pointerLockElement !== canvas || !state.running || state.paused) return;
    const lookX = event.movementX * (state.sensitivity * (state.invertLook ? -1 : 1));
    state.player.angle += lookX * (state.turnSpeed * 0.02);
    setPlayerDirection();
  });
  document.addEventListener('keydown', handleKeydown);
  document.addEventListener('keyup', handleKeyup);

  settingSensitivity.addEventListener('input', () => {
    state.sensitivity = Number(settingSensitivity.value);
    settingSensitivityValue.textContent = state.sensitivity.toFixed(4);
  });
  settingTurnspeed.addEventListener('input', () => {
    state.turnSpeed = Number(settingTurnspeed.value);
    settingTurnspeedValue.textContent = state.turnSpeed.toFixed(1);
  });
  settingEnemySpeed.addEventListener('input', () => {
    state.enemySpeed = Number(settingEnemySpeed.value);
    settingEnemySpeedValue.textContent = state.enemySpeed.toFixed(2);
  });
  settingMinimap.addEventListener('change', () => { state.showMinimap = settingMinimap.checked; });
  settingPaths.addEventListener('change', () => { state.showPaths = settingPaths.checked; });
  settingCrosshair.addEventListener('change', () => { state.showCrosshair = settingCrosshair.checked; crosshair.style.display = state.showCrosshair ? 'block' : 'none'; });
  settingInvertLook.addEventListener('change', () => { state.invertLook = settingInvertLook.checked; });
  settingReset.addEventListener('click', resetSettings);

  applySettingsUI();
  updateHud();
})();
