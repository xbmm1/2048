// game.js — Void Runner: an original pseudo-3D tunnel runner.
// Single-file, no build step, no external engines. Open index.html directly.

(function () {
  'use strict';

  // ======================= CONFIG =======================
  const CONFIG = {
    backgroundTop: '#59F0EB',
    backgroundBottom: '#1ec4c7',
    tunnelWidth: 5,           // lanes across each surface
    tileSize: 6,              // world units per tile row (z-length)
    rowsPerPattern: 6,        // rows generated per pattern batch
    aheadPatterns: 6,         // how many pattern batches to keep generated ahead
    tunnelHalfWidth: 11,      // world units, half physical width/height of the square tunnel
    baseSpeed: 15,
    maxSpeed: 42,
    speedRampDistance: 3200,  // distance (world units) over which speed ramps to max
    gravity: 46,
    jumpVelocity: 16,
    lateralAccel: 70,
    lateralMaxSpeed: 15,
    lateralDamping: 9,
    cameraFocalLength: 300,
    cameraBackOffset: 30,     // camera trails behind the player along z
    cameraHeightOffset: 6,    // camera lifted slightly above the active floor
    fogDistance: 190,
    rotationDuration: 0.32,
    coyoteTime: 0.1,
    jumpBufferTime: 0.1,
    maxParticles: 220,
    difficultyDistance: 2600, // distance to reach full difficulty
  };

  const TUNNEL_COLORS = {
    floor: [13, 17, 19],
    ceiling: [17, 23, 24],
    wall: [10, 14, 15],
    obstacle: [26, 34, 36],
    hazard: [255, 76, 76],
    crumble: [120, 90, 40],
  };

  // ======================= UTILITIES =======================
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }
  function rgba(c, a) { return `rgba(${c[0]},${c[1]},${c[2]},${a})`; }
  function mixColor(c, target, t) {
    return [
      c[0] + (target[0] - c[0]) * t,
      c[1] + (target[1] - c[1]) * t,
      c[2] + (target[2] - c[2]) * t,
    ];
  }

  const GameState = { MENU: 'menu', PLAYING: 'playing', PAUSED: 'paused', GAME_OVER: 'gameOver' };

  // ======================= INPUT MANAGER =======================
  class InputManager {
    constructor() {
      this.held = Object.create(null);
      this.justPressed = Object.create(null);
      this._pending = [];
      window.addEventListener('keydown', (e) => this._onKeyDown(e));
      window.addEventListener('keyup', (e) => this._onKeyUp(e));
    }
    _onKeyDown(e) {
      const k = e.key.toLowerCase();
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
      if (!this.held[k]) this._pending.push(k);
      this.held[k] = true;
    }
    _onKeyUp(e) {
      this.held[e.key.toLowerCase()] = false;
    }
    // Call once per frame after processing justPressed flags.
    beginFrame() {
      this.justPressed = Object.create(null);
      for (const k of this._pending) this.justPressed[k] = true;
      this._pending = [];
    }
    pressVirtual(key) { this._pending.push(key); this.held[key] = true; }
    releaseVirtual(key) { this.held[key] = false; }
    isDown(...keys) { return keys.some((k) => this.held[k]); }
    pressed(...keys) { return keys.some((k) => this.justPressed[k]); }
  }

  // ======================= AUDIO MANAGER =======================
  class AudioManager {
    constructor() {
      this.ctx = null;
      this.muted = false;
      this.unlocked = false;
      this._hum = null;
    }
    unlock() {
      if (this.unlocked) return;
      this.unlocked = true;
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this._startHum();
    }
    toggleMute() {
      this.muted = !this.muted;
      if (this._hum) this._hum.gain.gain.value = this.muted ? 0 : 0.015;
      return this.muted;
    }
    _startHum() {
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = 55;
      gain.gain.value = this.muted ? 0 : 0.015;
      osc.connect(gain).connect(this.ctx.destination);
      osc.start();
      this._hum = { osc, gain };
    }
    _tone(freq, duration, type, gainVal, sweepTo) {
      if (!this.ctx || this.muted) return;
      const t0 = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t0);
      if (sweepTo) osc.frequency.exponentialRampToValueAtTime(sweepTo, t0 + duration);
      gain.gain.setValueAtTime(gainVal, t0);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
      osc.connect(gain).connect(this.ctx.destination);
      osc.start(t0);
      osc.stop(t0 + duration + 0.02);
    }
    jump() { this._tone(420, 0.15, 'square', 0.05, 720); }
    land() { this._tone(160, 0.1, 'sine', 0.06, 90); }
    collect() { this._tone(880, 0.12, 'triangle', 0.06, 1400); }
    rotate() { this._tone(300, 0.22, 'sawtooth', 0.04, 500); }
    collision() { this._tone(120, 0.3, 'square', 0.08, 40); }
    gameOver() { this._tone(220, 0.6, 'sawtooth', 0.08, 40); }
  }

  // ======================= PARTICLE SYSTEM =======================
  class ParticleSystem {
    constructor() { this.particles = []; }
    spawn(x, y, z, opts) {
      if (this.particles.length >= CONFIG.maxParticles) this.particles.shift();
      const angle = Math.random() * Math.PI * 2;
      const speed = (opts.speed || 6) * (0.4 + Math.random() * 0.6);
      this.particles.push({
        x, y, z,
        vx: Math.cos(angle) * speed * (opts.spreadXZ ?? 1),
        vy: (opts.vy ?? (Math.random() * 4 + 2)),
        vz: Math.sin(angle) * speed * (opts.spreadXZ ?? 1),
        life: 0, maxLife: opts.life || 0.6,
        size: opts.size || 2.2,
        color: opts.color || [255, 255, 255],
      });
    }
    burst(x, y, z, count, opts) {
      for (let i = 0; i < count; i++) this.spawn(x, y, z, opts);
    }
    update(dt) {
      for (let i = this.particles.length - 1; i >= 0; i--) {
        const p = this.particles[i];
        p.life += dt;
        if (p.life >= p.maxLife) { this.particles.splice(i, 1); continue; }
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z += p.vz * dt;
        p.vy -= 10 * dt;
      }
    }
  }

  // ======================= CAMERA =======================
  class Camera {
    constructor() {
      this.x = 0; this.y = CONFIG.cameraHeightOffset; this.z = -CONFIG.cameraBackOffset;
      this.roll = 0;        // current visual roll angle (radians)
      this.targetRoll = 0;
      this.rollTimer = 0;
      this.rolling = false;
      this.shake = 0;
    }
    startRoll(deltaOrientationSteps) {
      this.targetRoll += deltaOrientationSteps * (Math.PI / 2);
      this.rollTimer = 0;
      this.rolling = true;
    }
    addShake(amount) { this.shake = Math.min(1, this.shake + amount); }
    update(dt, player) {
      this.x += (player.lane - this.x) * Math.min(1, 8 * dt);
      this.z = player.z - CONFIG.cameraBackOffset;
      if (this.rolling) {
        this.rollTimer += dt;
        const t = clamp(this.rollTimer / CONFIG.rotationDuration, 0, 1);
        this.roll = lerp(this._rollStart ?? this.roll, this.targetRoll, easeInOutCubic(t));
        if (t >= 1) { this.rolling = false; this.roll = this.targetRoll; }
      }
      this.shake = Math.max(0, this.shake - dt * 2.4);
    }
  }

  // ======================= PLAYER =======================
  class Player {
    constructor() { this.reset(); }
    reset() {
      this.z = 0;
      this.lane = 0;          // lateral position, world units from center
      this.laneVel = 0;
      this.height = 0;        // 0 = grounded on active surface
      this.heightVel = 0;
      this.grounded = true;
      this.orientation = 0;   // 0 floor,1 right wall,2 ceiling,3 left wall (visual only)
      this.rotating = false;
      this.coyoteTimer = 0;
      this.jumpBuffer = 0;
      this.animPhase = 0;
      this.squash = 1;
      this.dead = false;
      this.landedFlashTimer = 0;
      this.tiltVisual = 0;
    }
    jumpRequest() { this.jumpBuffer = CONFIG.jumpBufferTime; }
    tryRotate(dir, camera) {
      if (this.rotating) return;
      this.orientation = (this.orientation + dir + 4) % 4;
      this.rotating = true;
      camera._rollStart = camera.roll;
      camera.startRoll(dir);
      setTimeout(() => { this.rotating = false; }, CONFIG.rotationDuration * 1000);
    }
  }

  // ======================= TUNNEL GENERATOR =======================
  class TunnelGenerator {
    constructor() {
      this.rows = [];          // { z, tileIndex, floor:[bool], hazard:[bool], crumble:[bool], crumbleAt:[time|null],
                                //   obstacle: {type,lane}|null, collectibles:[lane,...] }
      this.nextTileIndex = 0;
      this.lastPatternWasHard = false;
    }
    reset() {
      this.rows = [];
      this.nextTileIndex = 0;
      this.lastPatternWasHard = false;
      for (let i = 0; i < CONFIG.aheadPatterns; i++) this._generateBatch(0);
    }
    ensureAhead(playerZ) {
      const lastZ = this.rows.length ? this.rows[this.rows.length - 1].z : 0;
      if (lastZ - playerZ < CONFIG.tileSize * CONFIG.rowsPerPattern * (CONFIG.aheadPatterns - 1)) {
        this._generateBatch(playerZ);
      }
      // Drop rows well behind the player.
      while (this.rows.length && this.rows[0].z < playerZ - CONFIG.tileSize * 6) this.rows.shift();
    }
    rowAtZ(z) {
      const idx = Math.floor(z / CONFIG.tileSize);
      return this.rows.find((r) => r.tileIndex === idx) || null;
    }
    _emptyRow(tileIndex) {
      const w = CONFIG.tunnelWidth;
      return {
        tileIndex, z: tileIndex * CONFIG.tileSize,
        floor: new Array(w).fill(true),
        hazard: new Array(w).fill(false),
        crumble: new Array(w).fill(false),
        crumbleAt: new Array(w).fill(null),
        obstacle: null,
        collectibles: [],
      };
    }
    _laneToIndex(lane) {
      const half = (CONFIG.tunnelWidth - 1) / 2;
      return clamp(Math.round(lane / this._laneStep()) + half, 0, CONFIG.tunnelWidth - 1);
    }
    _laneStep() {
      return (CONFIG.tunnelHalfWidth * 2) / (CONFIG.tunnelWidth - 1) * 0.5;
    }
    indexToLane(index) {
      const half = (CONFIG.tunnelWidth - 1) / 2;
      return (index - half) * this._laneStep();
    }
    _difficultyAt(distance) { return clamp(distance / CONFIG.difficultyDistance, 0, 1); }

    _generateBatch(playerZ) {
      const startIndex = this.nextTileIndex;
      const distance = startIndex * CONFIG.tileSize;
      const diff = this._difficultyAt(distance);

      let pool;
      if (diff < 0.3) pool = ['full', 'full', 'centerGap', 'collect', 'block'];
      else if (diff < 0.7) pool = ['centerGap', 'sideGap', 'alternating', 'block', 'gate', 'collect', 'hazard'];
      else pool = ['narrowBridge', 'gate', 'alternating', 'hazard', 'crumble', 'sideGap', 'block'];

      let choice = pool[Math.floor(Math.random() * pool.length)];
      const hardSet = new Set(['narrowBridge', 'gate', 'hazard', 'crumble', 'alternating']);
      if (this.lastPatternWasHard && hardSet.has(choice)) choice = 'full';
      this.lastPatternWasHard = hardSet.has(choice);

      const rows = this._buildPattern(choice, startIndex);
      for (const r of rows) this.rows.push(r);
      this.nextTileIndex = startIndex + rows.length;
    }

    _buildPattern(name, startIndex) {
      const n = CONFIG.rowsPerPattern;
      const w = CONFIG.tunnelWidth;
      const rows = [];
      for (let i = 0; i < n; i++) rows.push(this._emptyRow(startIndex + i));
      const mid = (w - 1) / 2;

      switch (name) {
        case 'full':
          break;
        case 'centerGap':
          for (let i = 2; i < n - 1; i++) rows[i].floor[Math.round(mid)] = false;
          break;
        case 'sideGap': {
          const side = Math.random() < 0.5 ? 0 : w - 1;
          for (let i = 2; i < n - 1; i++) rows[i].floor[side] = false;
          break;
        }
        case 'alternating':
          for (let i = 1; i < n - 1; i++) {
            const lane = i % 2 === 0 ? 0 : w - 1;
            rows[i].floor[lane] = false;
          }
          break;
        case 'narrowBridge': {
          let lane = Math.round(mid);
          for (let i = 1; i < n - 1; i++) {
            lane = clamp(lane + (Math.random() < 0.5 ? -1 : 1), 0, w - 1);
            for (let l = 0; l < w; l++) rows[i].floor[l] = (l === lane);
          }
          break;
        }
        case 'block': {
          const lane = Math.floor(Math.random() * w);
          const r = Math.floor(n / 2);
          rows[r].obstacle = { type: 'block', lane };
          break;
        }
        case 'gate': {
          let lane = Math.floor(Math.random() * w);
          for (let i = 1; i < n - 1; i++) {
            lane = clamp(lane + (Math.random() < 0.5 ? -1 : (Math.random() < 0.5 ? 0 : 1)), 0, w - 1);
            rows[i].obstacle = { type: 'gate', lane };
          }
          break;
        }
        case 'hazard': {
          const lane = Math.floor(Math.random() * w);
          const r = Math.floor(n / 2);
          rows[r].hazard[lane] = true;
          break;
        }
        case 'crumble': {
          const lane = Math.floor(Math.random() * w);
          for (let i = 1; i < n - 2; i++) rows[i].crumble[lane] = true;
          break;
        }
        case 'collect':
        default:
          break;
      }

      // Collectibles: sprinkle along a safe lane, skipped on hard patterns.
      if (!['narrowBridge', 'gate', 'crumble'].includes(name)) {
        const lane = Math.floor(Math.random() * w);
        for (let i = 0; i < n; i += 2) {
          if (rows[i].floor[lane] && !rows[i].hazard[lane]) rows[i].collectibles.push(lane);
        }
      }
      return rows;
    }
  }

  // ======================= RENDERER =======================
  class Renderer {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.dpr = Math.min(2, window.devicePixelRatio || 1);
    }
    resize() {
      const w = window.innerWidth, h = window.innerHeight;
      this.canvas.width = Math.floor(w * this.dpr);
      this.canvas.height = Math.floor(h * this.dpr);
      this.canvas.style.width = w + 'px';
      this.canvas.style.height = h + 'px';
      this.cx = this.canvas.width / 2;
      this.cy = this.canvas.height / 2;
    }
    project(x, y, z, camera) {
      const dz = z - camera.z;
      if (dz <= 0.5) return null;
      const scale = (CONFIG.cameraFocalLength * this.dpr) / dz;
      let sx = this.cx + (x - camera.x) * scale;
      let sy = this.cy - (y - camera.y) * scale + camera.shake * (Math.random() - 0.5) * 6 * this.dpr;
      if (camera.roll !== 0) {
        const dx = sx - this.cx, dy = sy - this.cy;
        const c = Math.cos(-camera.roll), s = Math.sin(-camera.roll);
        sx = this.cx + dx * c - dy * s;
        sy = this.cy + dx * s + dy * c;
      }
      return { x: sx, y: sy, scale, dz };
    }
    fogFactor(dz) { return clamp(dz / (CONFIG.fogDistance * this.dpr), 0, 1); }

    clear() {
      const ctx = this.ctx;
      const grad = ctx.createLinearGradient(0, 0, 0, this.canvas.height);
      grad.addColorStop(0, CONFIG.backgroundTop);
      grad.addColorStop(1, CONFIG.backgroundBottom);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }

    drawQuad(p1, p2, p3, p4, color, fog) {
      if (!p1 || !p2 || !p3 || !p4) return;
      const ctx = this.ctx;
      const bg = [89, 240, 235];
      const mixed = mixColor(color, bg, fog * 0.85);
      ctx.fillStyle = `rgb(${mixed[0] | 0},${mixed[1] | 0},${mixed[2] | 0})`;
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.lineTo(p3.x, p3.y);
      ctx.lineTo(p4.x, p4.y);
      ctx.closePath();
      ctx.fill();
    }
  }

  // ======================= UI MANAGER =======================
  class UIManager {
    constructor(game) {
      this.game = game;
      this.$ = (id) => document.getElementById(id);
      this.menu = this.$('menu-screen');
      this.hud = this.$('hud');
      this.pause = this.$('pause-screen');
      this.gameOver = this.$('gameover-screen');
      this.mobileControls = this.$('mobile-controls');
      this._bind();
      this._detectTouch();
    }
    _detectTouch() {
      const isTouch = matchMedia('(pointer: coarse)').matches;
      if (isTouch) this.mobileControls.classList.remove('hidden');
    }
    _bind() {
      const game = this.game;
      this.$('start-btn').addEventListener('click', () => game.startRun());
      this.$('restart-btn').addEventListener('click', () => game.startRun());
      this.$('restart-from-pause-btn').addEventListener('click', () => game.startRun());
      this.$('resume-btn').addEventListener('click', () => game.resume());
      const soundBtn1 = this.$('sound-toggle-btn');
      const soundBtn2 = this.$('sound-toggle-btn-2');
      const toggleSound = () => {
        game.audio.unlock();
        const muted = game.audio.toggleMute();
        soundBtn1.textContent = 'SOUND: ' + (muted ? 'OFF' : 'ON');
        soundBtn2.textContent = 'SOUND: ' + (muted ? 'OFF' : 'ON');
      };
      soundBtn1.addEventListener('click', toggleSound);
      soundBtn2.addEventListener('click', toggleSound);

      const bindHold = (id, key) => {
        const el = this.$(id);
        const press = (e) => { e.preventDefault(); game.input.pressVirtual(key); };
        const release = (e) => { e.preventDefault(); game.input.releaseVirtual(key); };
        el.addEventListener('touchstart', press, { passive: false });
        el.addEventListener('touchend', release, { passive: false });
        el.addEventListener('mousedown', press);
        el.addEventListener('mouseup', release);
        el.addEventListener('mouseleave', release);
      };
      bindHold('mc-left', 'a');
      bindHold('mc-right', 'd');
      bindHold('mc-jump', ' ');
      const tapOnce = (id, key) => {
        const el = this.$(id);
        const fire = (e) => { e.preventDefault(); game.input.pressVirtual(key); };
        el.addEventListener('touchstart', fire, { passive: false });
        el.addEventListener('click', fire);
      };
      tapOnce('mc-rotate-l', 'q');
      tapOnce('mc-rotate-r', 'e');
    }
    showMenu() {
      this.menu.classList.remove('hidden');
      this.hud.classList.add('hidden');
      this.pause.classList.add('hidden');
      this.gameOver.classList.add('hidden');
      this.$('menu-high-score').textContent = this.game.highScore;
    }
    showHUD() {
      this.menu.classList.add('hidden');
      this.hud.classList.remove('hidden');
      this.pause.classList.add('hidden');
      this.gameOver.classList.add('hidden');
    }
    showPause() { this.pause.classList.remove('hidden'); }
    hidePause() { this.pause.classList.add('hidden'); }
    showGameOver(stats) {
      this.gameOver.classList.remove('hidden');
      this.$('final-score').textContent = stats.score;
      this.$('final-distance').textContent = Math.floor(stats.distance) + ' m';
      this.$('final-energy').textContent = stats.energy;
      this.$('final-best').textContent = stats.best;
    }
    updateHUD(stats) {
      this.$('hud-score').textContent = stats.score;
      this.$('hud-distance').textContent = Math.floor(stats.distance) + ' m';
      this.$('hud-energy').textContent = stats.energy;
      this.$('hud-speed').textContent = stats.speedMult.toFixed(1) + 'x';
    }
  }

  // ======================= GAME =======================
  class Game {
    constructor() {
      this.canvas = document.getElementById('game-canvas');
      this.renderer = new Renderer(this.canvas);
      this.input = new InputManager();
      this.audio = new AudioManager();
      this.particles = new ParticleSystem();
      this.camera = new Camera();
      this.player = new Player();
      this.tunnel = new TunnelGenerator();
      this.ui = new UIManager(this);
      this.state = GameState.MENU;
      this.distance = 0;
      this.energy = 0;
      this.score = 0;
      this.speed = CONFIG.baseSpeed;
      this.highScore = Number(localStorage.getItem('voidRunnerHighScore') || 0);
      this._steppedCrumble = new Set();

      window.addEventListener('resize', () => this.renderer.resize());
      this.renderer.resize();
      this.ui.showMenu();
      this._lastTime = performance.now();
      requestAnimationFrame((t) => this._loop(t));
    }

    startRun() {
      this.audio.unlock();
      this.state = GameState.PLAYING;
      this.distance = 0; this.energy = 0; this.score = 0; this.speed = CONFIG.baseSpeed;
      this.player.reset();
      this.camera.roll = 0; this.camera.targetRoll = 0; this.camera.rolling = false;
      this.tunnel.reset();
      this._steppedCrumble.clear();
      this.ui.showHUD();
    }
    pause() {
      if (this.state !== GameState.PLAYING) return;
      this.state = GameState.PAUSED;
      this.ui.showPause();
    }
    resume() {
      if (this.state !== GameState.PAUSED) return;
      this.state = GameState.PLAYING;
      this.ui.hidePause();
      this._lastTime = performance.now();
    }
    gameOver() {
      this.state = GameState.GAME_OVER;
      this.audio.gameOver();
      this.particles.burst(this.player.lane, this.player.height + 1, this.player.z, 40, {
        speed: 10, life: 0.8, size: 3, color: [255, 110, 110], spreadXZ: 1,
      });
      this.highScore = Math.max(this.highScore, this.score);
      localStorage.setItem('voidRunnerHighScore', String(this.highScore));
      this.ui.showGameOver({ score: this.score, distance: this.distance, energy: this.energy, best: this.highScore });
    }

    _handleGlobalInput() {
      const input = this.input;
      if (input.pressed('enter') && this.state === GameState.MENU) this.startRun();
      if (input.pressed('r') && this.state === GameState.GAME_OVER) this.startRun();
      if (input.pressed('p') || input.pressed('escape')) {
        if (this.state === GameState.PLAYING) this.pause();
        else if (this.state === GameState.PAUSED) this.resume();
      }
      if (input.pressed('m')) {
        this.audio.unlock();
        this.audio.toggleMute();
      }
    }

    _updatePlaying(dt) {
      const p = this.player, input = this.input, cam = this.camera, tunnel = this.tunnel;

      // Speed ramp.
      const t = clamp(this.distance / CONFIG.speedRampDistance, 0, 1);
      this.speed = lerp(CONFIG.baseSpeed, CONFIG.maxSpeed, t);
      p.z += this.speed * dt;
      this.distance = p.z;

      // Lateral movement.
      let accel = 0;
      if (input.isDown('a', 'arrowleft')) accel -= CONFIG.lateralAccel;
      if (input.isDown('d', 'arrowright')) accel += CONFIG.lateralAccel;
      p.laneVel += accel * dt;
      p.laneVel -= p.laneVel * Math.min(1, CONFIG.lateralDamping * dt);
      p.laneVel = clamp(p.laneVel, -CONFIG.lateralMaxSpeed, CONFIG.lateralMaxSpeed);
      p.lane = clamp(p.lane + p.laneVel * dt, -CONFIG.tunnelHalfWidth, CONFIG.tunnelHalfWidth);
      p.tiltVisual = lerp(p.tiltVisual, clamp(p.laneVel / CONFIG.lateralMaxSpeed, -1, 1), Math.min(1, 10 * dt));

      // Jump input buffering + coyote time.
      if (input.pressed('w', ' ', 'arrowup')) p.jumpBuffer = CONFIG.jumpBufferTime;
      if (p.jumpBuffer > 0) p.jumpBuffer -= dt;
      if (p.grounded) p.coyoteTimer = CONFIG.coyoteTime; else p.coyoteTimer -= dt;
      if (p.jumpBuffer > 0 && p.coyoteTimer > 0) {
        p.heightVel = CONFIG.jumpVelocity;
        p.grounded = false;
        p.jumpBuffer = 0; p.coyoteTimer = 0;
        this.audio.jump();
        this.particles.burst(p.lane, p.height, p.z, 8, { speed: 4, life: 0.35, size: 2, color: [255, 255, 255] });
      }

      // Gravity rotation.
      if (input.pressed('q')) { p.tryRotate(-1, cam); this.audio.rotate(); }
      if (input.pressed('e')) { p.tryRotate(1, cam); this.audio.rotate(); }

      // Vertical physics.
      const wasGrounded = p.grounded;
      p.heightVel -= CONFIG.gravity * dt;
      p.height += p.heightVel * dt;

      // Determine footing at the player's current row/lane.
      const row = tunnel.rowAtZ(p.z);
      const laneIndex = tunnel._laneToIndex(p.lane);
      let solidHere = false, hazardHere = false;
      if (row) {
        solidHere = !!row.floor[laneIndex];
        hazardHere = !!row.hazard[laneIndex];
        if (row.crumble[laneIndex]) {
          const key = row.tileIndex + ':' + laneIndex;
          if (!this._steppedCrumble.has(key) && p.height <= 0.05) {
            this._steppedCrumble.add(key);
            setTimeout(() => { row.floor[laneIndex] = false; }, 350);
          }
        }
        if (row.obstacle) {
          const obs = row.obstacle;
          const hitLane = Math.abs(obs.lane - laneIndex) === 0;
          const rowClose = Math.abs(row.z + CONFIG.tileSize / 2 - p.z) < CONFIG.tileSize * 0.55;
          if (hitLane && rowClose) {
            if (obs.type === 'block' && p.height < 3.2) this._kill();
            if (obs.type === 'gate' && p.height < 1.6) this._kill();
          }
        }
        // Collectibles.
        if (row.collectibles.includes(laneIndex)) {
          const rowClose = Math.abs(row.z + CONFIG.tileSize / 2 - p.z) < CONFIG.tileSize * 0.5;
          if (rowClose && p.height < 3) {
            row.collectibles = row.collectibles.filter((l) => l !== laneIndex);
            this.energy++;
            this.audio.collect();
            this.particles.burst(p.lane, p.height + 1, p.z, 10, { speed: 5, life: 0.4, size: 2.4, color: [255, 244, 170] });
          }
        }
      }

      if (p.height <= 0) {
        if (solidHere && !hazardHere) {
          if (!wasGrounded) {
            p.squash = 0.6;
            this.audio.land();
            this.particles.burst(p.lane, 0, p.z, 6, { speed: 3, life: 0.3, size: 2, color: [230, 230, 230] });
          }
          p.height = 0; p.heightVel = 0; p.grounded = true;
        } else {
          p.grounded = false;
          if (p.height < -6 || hazardHere) this._kill();
        }
      } else {
        p.grounded = false;
      }

      p.squash = lerp(p.squash, 1, Math.min(1, 8 * dt));
      p.animPhase += dt * (3 + Math.abs(p.laneVel) * 0.2) * (p.grounded ? 1 : 0.3);

      cam.update(dt, p);
      tunnel.ensureAhead(p.z);
      this.particles.update(dt);

      this.score = Math.floor(this.distance * 10) + this.energy * 100;
    }

    _kill() {
      if (this.player.dead) return;
      this.player.dead = true;
      this.audio.collision();
      this.camera.addShake(1);
      this.gameOver();
    }

    _render() {
      const r = this.renderer, ctx = r.ctx, cam = this.camera, p = this.player, tunnel = this.tunnel;
      r.clear();
      if (this.state === GameState.MENU) return;

      const half = CONFIG.tunnelHalfWidth;
      const w = CONFIG.tunnelWidth;
      const step = (half * 2) / w;

      const visRows = tunnel.rows.filter((row) => row.z + CONFIG.tileSize > p.z - CONFIG.tileSize && row.z < p.z + CONFIG.fogDistance);
      visRows.sort((a, b) => b.z - a.z); // far to near

      for (const row of visRows) {
        const z0 = row.z, z1 = row.z + CONFIG.tileSize;
        const fog = r.fogFactor(z0 - cam.z);
        // Floor & ceiling tiles across lanes.
        for (let i = 0; i < w; i++) {
          const x0 = -half + i * step, x1 = x0 + step;
          if (row.floor[i]) {
            const color = row.hazard[i] ? TUNNEL_COLORS.hazard : (row.crumble[i] ? TUNNEL_COLORS.crumble : TUNNEL_COLORS.floor);
            const fp1 = r.project(x0, 0, z0, cam), fp2 = r.project(x1, 0, z0, cam);
            const fp3 = r.project(x1, 0, z1, cam), fp4 = r.project(x0, 0, z1, cam);
            r.drawQuad(fp1, fp2, fp3, fp4, color, fog);
          }
          const cp1 = r.project(x0, half * 2, z0, cam), cp2 = r.project(x1, half * 2, z0, cam);
          const cp3 = r.project(x1, half * 2, z1, cam), cp4 = r.project(x0, half * 2, z1, cam);
          r.drawQuad(cp1, cp2, cp3, cp4, TUNNEL_COLORS.ceiling, fog);
        }
        // Left / right walls (decorative, full height).
        const lw1 = r.project(-half, 0, z0, cam), lw2 = r.project(-half, half * 2, z0, cam);
        const lw3 = r.project(-half, half * 2, z1, cam), lw4 = r.project(-half, 0, z1, cam);
        r.drawQuad(lw1, lw2, lw3, lw4, TUNNEL_COLORS.wall, fog);
        const rw1 = r.project(half, 0, z0, cam), rw2 = r.project(half, half * 2, z0, cam);
        const rw3 = r.project(half, half * 2, z1, cam), rw4 = r.project(half, 0, z1, cam);
        r.drawQuad(rw1, rw2, rw3, rw4, TUNNEL_COLORS.wall, fog);

        // Obstacles.
        if (row.obstacle) {
          const oi = row.obstacle.lane;
          const ox0 = -half + oi * step, ox1 = ox0 + step;
          const oh = row.obstacle.type === 'block' ? half * 1.6 : half * 0.7;
          const oColor = row.obstacle.type === 'gate' ? [255, 150, 60] : TUNNEL_COLORS.obstacle;
          const b1 = r.project(ox0, 0, z0, cam), b2 = r.project(ox1, 0, z0, cam);
          const b3 = r.project(ox1, oh, z0, cam), b4 = r.project(ox0, oh, z0, cam);
          r.drawQuad(b1, b2, b3, b4, oColor, fog);
        }
        // Collectibles.
        for (const li of row.collectibles) {
          const cxw = -half + li * step + step / 2;
          const cz = row.z + CONFIG.tileSize / 2;
          const bob = Math.sin(performance.now() / 300 + li) * 0.6;
          const cp = r.project(cxw, 2.4 + bob, cz, cam);
          if (cp) {
            const glow = clamp(1 - r.fogFactor(cz - cam.z), 0.2, 1);
            ctx.fillStyle = `rgba(255, 244, 170, ${glow})`;
            ctx.beginPath();
            ctx.arc(cp.x, cp.y, Math.max(1.5, 5 * cp.scale * r.dpr), 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }

      // Particles.
      for (const particle of this.particles.particles) {
        const pp = r.project(particle.x, particle.y, particle.z, cam);
        if (!pp) continue;
        const alpha = 1 - particle.life / particle.maxLife;
        ctx.fillStyle = rgba(particle.color, alpha);
        ctx.beginPath();
        ctx.arc(pp.x, pp.y, Math.max(1, particle.size * pp.scale * r.dpr), 0, Math.PI * 2);
        ctx.fill();
      }

      this._drawPlayer(r, cam, p);
    }

    _drawPlayer(r, cam, p) {
      const ctx = r.ctx;
      const pp = r.project(p.lane, p.height, p.z + 6, cam);
      if (!pp) return;
      const s = pp.scale * r.dpr * 10;
      const bob = p.grounded ? Math.sin(p.animPhase * 2) * 1.2 : 0;

      ctx.save();
      ctx.translate(pp.x, pp.y - s * 0.9 - bob);
      ctx.rotate(p.tiltVisual * 0.2 - cam.roll * 0);
      ctx.scale(1, p.squash);

      // Shadow.
      ctx.save();
      ctx.translate(0, s * 0.95);
      ctx.scale(1, 0.35);
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath();
      ctx.arc(0, 0, s * 0.55, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Antennae.
      ctx.strokeStyle = '#c9c9d2';
      ctx.lineWidth = Math.max(1, s * 0.06);
      const antSway = Math.sin(p.animPhase * 2) * 0.15;
      ctx.beginPath(); ctx.moveTo(-s * 0.28, -s * 0.55); ctx.lineTo(-s * 0.42 + antSway * s, -s * 0.95); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(s * 0.28, -s * 0.55); ctx.lineTo(s * 0.42 - antSway * s, -s * 0.95); ctx.stroke();
      ctx.fillStyle = '#e7e7ee';
      ctx.beginPath(); ctx.arc(-s * 0.42 + antSway * s, -s * 0.95, s * 0.07, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(s * 0.42 - antSway * s, -s * 0.95, s * 0.07, 0, Math.PI * 2); ctx.fill();

      // Legs.
      const legSwing = p.grounded ? Math.sin(p.animPhase * 6) * s * 0.22 : s * 0.1;
      ctx.strokeStyle = '#8f95a3';
      ctx.lineWidth = Math.max(1, s * 0.14);
      ctx.beginPath(); ctx.moveTo(-s * 0.2, s * 0.5); ctx.lineTo(-s * 0.2 + legSwing, s * 0.85); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(s * 0.2, s * 0.5); ctx.lineTo(s * 0.2 - legSwing, s * 0.85); ctx.stroke();

      // Arms.
      const armSwing = p.grounded ? -legSwing * 0.8 : -s * 0.3;
      ctx.beginPath(); ctx.moveTo(-s * 0.45, -s * 0.05); ctx.lineTo(-s * 0.45 + armSwing, s * 0.3); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(s * 0.45, -s * 0.05); ctx.lineTo(s * 0.45 - armSwing, s * 0.3); ctx.stroke();

      // Body.
      ctx.fillStyle = '#b9bcc6';
      ctx.strokeStyle = '#3a3d47';
      ctx.lineWidth = Math.max(1, s * 0.05);
      ctx.beginPath();
      ctx.ellipse(0, 0, s * 0.5, s * 0.55, 0, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();

      // Visor / eyes.
      ctx.fillStyle = '#1a2230';
      ctx.beginPath();
      ctx.ellipse(0, -s * 0.06, s * 0.3, s * 0.16, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#7ff5ff';
      ctx.beginPath(); ctx.arc(-s * 0.1, -s * 0.06, s * 0.05, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(s * 0.1, -s * 0.06, s * 0.05, 0, Math.PI * 2); ctx.fill();

      ctx.restore();
    }

    _loop(now) {
      const dt = Math.min((now - this._lastTime) / 1000, 0.033);
      this._lastTime = now;
      this.input.beginFrame();
      this._handleGlobalInput();

      if (this.state === GameState.PLAYING) {
        this._updatePlaying(dt);
        this.ui.updateHUD({ score: this.score, distance: this.distance, energy: this.energy, speedMult: this.speed / CONFIG.baseSpeed });
      }
      this._render();
      requestAnimationFrame((t) => this._loop(t));
    }
  }

  window.addEventListener('DOMContentLoaded', () => { new Game(); });
})();
