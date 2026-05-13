(() => {
  "use strict";

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");

  const W = 960;
  const H = 540;
  const GROUND_H = 76;
  const PLAY_H = H - GROUND_H;
  const DASH_START_SCORE = 50;
  const TITLE = "Chicken Flap - For My Sexy Girlfriend Ella";
  const TWO_PI = Math.PI * 2;

  const keysDown = new Set();
  const once = new Set();

  const state = {
    mode: "title",
    phase: "flap",
    time: 0,
    score: 0,
    best: readBestScore(),
    seed: 17,
    speed: 185,
    spawnTimer: 0,
    shake: 0,
    dashFlash: 0,
    dashJumpBuffer: 0,
    dashCoyote: 0,
    dashStreak: 0,
    dashPatternIndex: 0,
    dashTrailTimer: 0,
    dashGravitySign: 1,
    dashBuildGravity: 1,
    message: "",
    checkpointUnlocked: false,
    player: makePlayer(),
    obstacles: [],
    dashObstacles: [],
    dashPlatforms: [],
    dashSpawnX: 0,
    dashTrails: [],
    feathers: [],
    hearts: [],
    clouds: [],
  };

  function makePlayer() {
    return {
      x: 210,
      y: 250,
      vy: 0,
      r: 22,
      angle: 0,
      flapPulse: 0,
      onGround: false,
      alive: true,
    };
  }

  function readBestScore() {
    const raw = window.localStorage?.getItem("chicken-flap-best");
    const value = Number.parseInt(raw || "0", 10);
    return Number.isFinite(value) ? value : 0;
  }

  function saveBestScore() {
    if (state.score > state.best) {
      state.best = state.score;
      window.localStorage?.setItem("chicken-flap-best", String(state.best));
    }
  }

  function resetGame() {
    const useCheckpoint = state.checkpointUnlocked;
    state.mode = "playing";
    state.phase = useCheckpoint ? "dash" : "flap";
    state.time = 0;
    state.score = useCheckpoint ? DASH_START_SCORE : 0;
    state.seed = useCheckpoint ? 5017 : 17;
    state.speed = useCheckpoint ? dashSpeed() : 185;
    state.spawnTimer = useCheckpoint ? 0 : 0.45;
    state.shake = 0;
    state.dashFlash = useCheckpoint ? 0.9 : 0;
    state.dashJumpBuffer = 0;
    state.dashCoyote = 0;
    state.dashStreak = 0;
    state.dashPatternIndex = 0;
    state.dashTrailTimer = 0;
    state.dashGravitySign = 1;
    state.dashBuildGravity = 1;
    state.message = useCheckpoint ? "Checkpoint 50" : "";
    state.player = makePlayer();
    state.obstacles.length = 0;
    state.dashObstacles.length = 0;
    state.dashPlatforms.length = 0;
    state.dashSpawnX = 0;
    state.dashTrails.length = 0;
    state.feathers.length = 0;
    state.hearts.length = 0;
    state.clouds = makeClouds();
    if (useCheckpoint) {
      startDashMode({ fromCheckpoint: true });
      return;
    }
    spawnObstacle(720);
    spawnObstacle(1080);
  }

  function makeClouds() {
    return [
      { x: 80, y: 88, s: 1.1 },
      { x: 390, y: 62, s: 0.85 },
      { x: 720, y: 104, s: 1.25 },
    ];
  }

  function seededRandom() {
    state.seed = (state.seed * 1664525 + 1013904223) >>> 0;
    return state.seed / 4294967296;
  }

  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  function difficultyLevel() {
    return Math.min(8, Math.floor(state.score / 5) + 1);
  }

  function difficultyLabel() {
    if (state.phase === "dash") return `Chicken Dash ${dashLevel()}`;
    return ["Cozy", "Peppy", "Quick", "Spicy", "Wild", "Turbo", "Chaos", "Legend"][difficultyLevel() - 1];
  }

  function scrollSpeed() {
    return Math.min(350, 185 + state.score * 5.4);
  }

  function gravity() {
    return Math.min(1030, 850 + state.score * 7);
  }

  function gapHeight() {
    return clamp(248 - state.score * 3.2, 150, 248);
  }

  function obstacleSpacing() {
    return clamp(365 - state.score * 6.4, 245, 365);
  }

  function gapForgiveness() {
    return clamp(38 - state.score * 0.5, 20, 38);
  }

  function obstacleWobbleY(obstacle) {
    return difficultyLevel() >= 4 ? Math.sin(obstacle.wobble) * Math.min(22, (difficultyLevel() - 3) * 3.8) : 0;
  }

  function dashGroundY() {
    return PLAY_H - 22;
  }

  function dashCeilingSurfaceY() {
    return 128;
  }

  function dashSpeed() {
    return Math.min(486, 318 + Math.max(0, state.score - DASH_START_SCORE) * 4.1);
  }

  function dashGravity() {
    return 1840;
  }

  function dashJumpVelocity() {
    return -670;
  }

  function dashLevel() {
    return Math.min(8, Math.floor(Math.max(0, state.score - DASH_START_SCORE) / 7) + 1);
  }

  function flap() {
    if (state.mode === "title") {
      resetGame();
      if (state.phase === "dash") jumpDash();
      else applyFlap();
      return;
    }
    if (state.mode === "gameover") {
      resetGame();
      if (state.phase === "dash") jumpDash();
      else applyFlap();
      return;
    }
    if (state.mode !== "playing") return;
    if (state.phase === "dash") jumpDash();
    else applyFlap();
  }

  function applyFlap() {
    state.player.vy = -320;
    state.player.flapPulse = 0.2;
    addFeathers(state.player.x - 12, state.player.y + 10, 7, 100);
    addHeart(state.player.x - 26, state.player.y - 18);
  }

  function jumpDash() {
    if (triggerDashOrb()) return;
    state.dashJumpBuffer = 0.14;
    tryDashJump();
  }

  function triggerDashOrb() {
    const player = state.player;
    for (const obstacle of state.dashObstacles) {
      if (obstacle.type !== "orb" || obstacle.used) continue;
      const dx = player.x - obstacle.x;
      const dy = player.y - obstacle.y;
      if (Math.hypot(dx, dy) > 42) continue;
      obstacle.used = true;
      player.vy = -760 * state.dashGravitySign;
      player.onGround = false;
      state.dashJumpBuffer = 0;
      state.dashCoyote = 0;
      state.dashFlash = Math.max(state.dashFlash, 0.5);
      state.message = "orb!";
      addFeathers(obstacle.x, obstacle.y, 18, 160);
      addDashTrail(player.x - 24, player.y + 4, 0.38, 26);
      return true;
    }
    return false;
  }

  function tryDashJump() {
    const player = state.player;
    if (!player.onGround && state.dashCoyote <= 0) return false;
    state.dashJumpBuffer = 0;
    state.dashCoyote = 0;
    player.vy = dashJumpVelocity() * state.dashGravitySign;
    player.onGround = false;
    player.flapPulse = 0.22;
    state.dashFlash = Math.max(state.dashFlash, 0.25);
    addFeathers(player.x - 8, player.y + player.r, 12, 130);
    addHeart(player.x - 24, player.y - 22);
    addDashTrail(player.x - 20, player.y + 8, 0.28, 20);
    return true;
  }

  function spawnObstacle(forceX) {
    const gapH = gapHeight();
    const gapY = 68 + seededRandom() * (PLAY_H - gapH - 96);
    const hasBonus = seededRandom() > 0.58 && difficultyLevel() < 8;
    state.obstacles.push({
      x: forceX ?? W + 64,
      w: Math.min(108, 86 + Math.floor(state.score / 8) * 3),
      gapY,
      gapH,
      passed: false,
      capOffset: seededRandom() * 16,
      wobble: seededRandom() * TWO_PI,
      bonus: hasBonus
        ? {
            x: (forceX ?? W + 64) + 43,
            y: gapY + gapH * 0.5,
            r: 11,
            collected: false,
          }
        : null,
    });
  }

  function startDashMode(options = {}) {
    if (state.phase === "dash" && !options.fromCheckpoint) return;
    state.phase = "dash";
    state.checkpointUnlocked = true;
    state.message = options.fromCheckpoint ? "Checkpoint 50" : "Checkpoint saved!";
    state.dashFlash = options.fromCheckpoint ? 0.9 : 1.2;
    state.obstacles.length = 0;
    state.dashObstacles.length = 0;
    state.speed = dashSpeed();
    state.player.x = 190;
    state.player.y = dashGroundY() - state.player.r;
    state.player.vy = 0;
    state.player.angle = 0;
    state.player.onGround = true;
    state.dashPlatforms.length = 0;
    state.dashSpawnX = W + 180;
    state.dashJumpBuffer = 0;
    state.dashCoyote = 0.12;
    state.dashStreak = 0;
    state.dashPatternIndex = 0;
    state.dashTrailTimer = 0;
    state.dashGravitySign = 1;
    state.dashBuildGravity = 1;
    state.dashTrails.length = 0;
    addDashPlatform(-120, dashGroundY(), W + 520, 34, 1);
    addFeathers(state.player.x, state.player.y, 36, 210);
    addHeart(state.player.x - 26, state.player.y - 28);
    spawnDashPattern(W + 520);
    spawnDashPattern(W + 920);
  }

  function spawnDashPattern(forceX) {
    const x = forceX ?? state.dashSpawnX;
    const level = dashLevel();
    const gravity = state.dashBuildGravity;
    const lane = dashSurfaceY(gravity);
    const warmup = state.dashPatternIndex < 4;
    const pools = [
      ["single", "gap-hop", "step", "pad-hop"],
      ["single", "gap-hop", "step", "orb-gap", "double"],
      ["double", "step", "block-spike", "pad-hop", "orb-gap", "stairs"],
      ["double", "stairs", "block-spike", "pad-hop", "orb-gap", "portal-flip"],
    ];
    const pool = warmup ? ["single", "gap-hop"] : pools[Math.min(pools.length - 1, Math.floor((level - 1) / 2))];
    const choice = pool[(state.dashPatternIndex + Math.floor(seededRandom() * pool.length)) % pool.length];
    state.dashPatternIndex += 1;

    if (choice === "single") {
      addDashPlatform(x, lane, 330, 34, gravity);
      addDashObstacle("spike", x + 154, lane, 34, 43, gravity);
      state.dashSpawnX = x + 320 - level * 8;
    } else if (choice === "double") {
      addDashPlatform(x, lane, 380, 34, gravity);
      addDashObstacle("spike", x + 128, lane, 34, 43, gravity);
      addDashObstacle("spike", x + 168, lane, 34, 43, gravity);
      state.dashSpawnX = x + 382 - level * 9;
    } else if (choice === "step") {
      const high = lane - 76 * gravity;
      addDashPlatform(x, lane, 160, 34, gravity);
      addDashPlatform(x + 205, high, 210, 34, gravity);
      addDashObstacle("spike", x + 305, high, 34, 43, gravity);
      state.dashSpawnX = x + 430 - level * 8;
    } else if (choice === "block-spike") {
      addDashPlatform(x, lane, 460, 34, gravity);
      addDashPlatform(x + 118, lane - 66 * gravity, 82, 34, gravity);
      addDashObstacle("spike", x + 254, lane, 34, 43, gravity);
      state.dashSpawnX = x + 455 - level * 10;
    } else if (choice === "pad-hop") {
      const high = lane - 112 * gravity;
      addDashPlatform(x, lane, 160, 34, gravity);
      addDashObstacle("pad", x + 62, lane, 58, 12, gravity);
      addDashPlatform(x + 250, high, 240, 34, gravity);
      addDashObstacle("spike", x + 378, high, 34, 43, gravity);
      state.dashSpawnX = x + 510 - level * 10;
    } else if (choice === "orb-gap") {
      addDashPlatform(x, lane, 150, 34, gravity);
      addDashObstacle("orb", x + 222, lane - 118 * gravity, 34, 34, gravity);
      addDashPlatform(x + 330, lane, 300, 34, gravity);
      addDashObstacle("spike", x + 482, lane, 34, 43, gravity);
      state.dashSpawnX = x + 620 - level * 9;
    } else if (choice === "stairs") {
      const mid = lane - 66 * gravity;
      const high = lane - 126 * gravity;
      addDashPlatform(x, lane, 150, 34, gravity);
      addDashPlatform(x + 190, mid, 154, 34, gravity);
      addDashPlatform(x + 380, high, 190, 34, gravity);
      addDashObstacle("spike", x + 456, high, 34, 43, gravity);
      state.dashSpawnX = x + 585 - level * 9;
    } else if (choice === "gap-hop") {
      addDashPlatform(x, lane, 170, 34, gravity);
      addDashPlatform(x + 305, lane, 260, 34, gravity);
      addDashObstacle("spike", x + 420, lane, 34, 43, gravity);
      state.dashSpawnX = x + 565 - level * 9;
    } else if (choice === "portal-flip") {
      addDashPlatform(x, lane, 210, 34, gravity);
      addDashObstacle("portal", x + 248, lane + (gravity === 1 ? -128 : 12), 54, 116, gravity);
      state.dashBuildGravity *= -1;
      const nextGravity = state.dashBuildGravity;
      const nextLane = dashSurfaceY(nextGravity);
      addDashPlatform(x + 360, nextLane, 460, 34, nextGravity);
      addDashObstacle("spike", x + 565, nextLane, 34, 43, nextGravity);
      state.dashSpawnX = x + 790 - level * 10;
    } else {
      addDashPlatform(x, lane, 380, 34, gravity);
      addDashObstacle("spike", x + 120, lane, 34, 43, gravity);
      addDashObstacle("spike", x + 252, lane, 34, 43, gravity);
      state.dashSpawnX = x + 430 - level * 9;
    }
    state.dashSpawnX = Math.max(x + 280, state.dashSpawnX + seededRandom() * 34);
  }

  function dashSurfaceY(gravity) {
    return gravity === 1 ? dashGroundY() : dashCeilingSurfaceY();
  }

  function platformYFromSurface(surfaceY, h, gravity) {
    return gravity === 1 ? surfaceY : surfaceY - h;
  }

  function addDashPlatform(x, surfaceY, w, h, gravity) {
    state.dashPlatforms.push({
      x,
      y: platformYFromSurface(surfaceY, h, gravity),
      surfaceY,
      w,
      h,
      gravity,
      pulse: seededRandom() * TWO_PI,
    });
  }

  function addDashObstacle(type, x, y, w, h, gravity) {
    state.dashObstacles.push({
      type,
      x,
      y,
      w,
      h,
      gravity,
      passed: false,
      used: false,
      pulse: seededRandom() * TWO_PI,
    });
  }

  function addFeathers(x, y, count, speed) {
    for (let i = 0; i < count; i += 1) {
      const a = seededRandom() * TWO_PI;
      const force = speed * (0.25 + seededRandom() * 0.8);
      state.feathers.push({
        x,
        y,
        vx: Math.cos(a) * force - 30,
        vy: Math.sin(a) * force,
        life: 0.35 + seededRandom() * 0.4,
        maxLife: 0.8,
        size: 3 + seededRandom() * 4,
      });
    }
  }

  function addHeart(x, y) {
    state.hearts.push({
      x,
      y,
      vx: -22 - seededRandom() * 24,
      vy: -28 - seededRandom() * 18,
      life: 0.58,
      maxLife: 0.58,
      size: 5 + seededRandom() * 3,
    });
  }

  function update(dt) {
    if (state.mode === "title") {
      state.time += dt;
      state.dashFlash = Math.max(0, state.dashFlash - dt);
      updateClouds(dt, 26);
      updateFeathers(dt);
      updateHearts(dt);
      return;
    }

    if (state.mode === "paused") {
      updateFeathers(dt);
      updateHearts(dt);
      return;
    }

    if (state.mode === "gameover") {
      state.time += dt;
      state.shake = Math.max(0, state.shake - dt);
      state.dashFlash = Math.max(0, state.dashFlash - dt);
      updateClouds(dt, 26);
      updateFeathers(dt);
      updateHearts(dt);
      return;
    }

    state.time += dt;
    if (state.phase === "dash") {
      updateDashMode(dt);
      return;
    }

    state.speed = scrollSpeed();
    state.shake = Math.max(0, state.shake - dt);
    state.spawnTimer -= dt;

    const player = state.player;
    player.vy += gravity() * dt;
    player.y += player.vy * dt;
    player.angle = clamp(player.vy / 520, -0.65, 0.9);
    player.flapPulse = Math.max(0, player.flapPulse - dt);

    updateClouds(dt, state.speed * 0.13);
    updateObstacles(dt);
    updateFeathers(dt);
    updateHearts(dt);
    checkCollisions();
  }

  function updateDashMode(dt) {
    state.speed = dashSpeed();
    state.shake = Math.max(0, state.shake - dt);
    state.dashFlash = Math.max(0, state.dashFlash - dt);
    state.dashJumpBuffer = Math.max(0, state.dashJumpBuffer - dt);
    state.dashTrailTimer -= dt;

    const player = state.player;
    const wasGrounded = player.onGround;
    const previousY = player.y;
    player.onGround = false;
    player.vy += dashGravity() * state.dashGravitySign * dt;
    player.y += player.vy * dt;
    updateDashObstacles(dt);
    resolveDashPlatformCollisions(previousY);
    checkDashCollisions();

    if (player.onGround) {
      state.dashCoyote = 0.1;
      if (!wasGrounded) addLandingDust(player.x - 8, player.y + player.r * state.dashGravitySign);
    } else {
      state.dashCoyote = Math.max(0, state.dashCoyote - dt);
    }
    if (state.dashJumpBuffer > 0) tryDashJump();

    player.angle = player.onGround
      ? Math.sin(state.time * 18) * 0.04
      : clamp((player.vy * state.dashGravitySign) / 760, -0.48, 0.72);
    player.flapPulse = Math.max(0, player.flapPulse - dt);

    if (state.dashTrailTimer <= 0) {
      state.dashTrailTimer = 0.035;
      addDashTrail(player.x - 20, player.y + 5, 0.22, 14);
    }

    updateClouds(dt, state.speed * 0.2);
    updateDashTrails(dt);
    updateFeathers(dt);
    updateHearts(dt);
  }

  function updateDashObstacles(dt) {
    for (let i = state.dashPlatforms.length - 1; i >= 0; i -= 1) {
      const platform = state.dashPlatforms[i];
      platform.x -= state.speed * dt;
      if (platform.x + platform.w < -120) state.dashPlatforms.splice(i, 1);
    }

    for (let i = state.dashObstacles.length - 1; i >= 0; i -= 1) {
      const obstacle = state.dashObstacles[i];
      obstacle.x -= state.speed * dt;
      if (!obstacle.passed && obstacle.x + obstacle.w < state.player.x - 12) {
        obstacle.passed = true;
        if (obstacle.type === "spike") {
          state.score += 1;
          state.dashStreak += 1;
          state.message = state.dashStreak >= 5 ? `${state.dashStreak} streak` : "+1 dash";
          addFeathers(state.player.x - 10, state.player.y + 8, 5, 85);
          addDashTrail(state.player.x - 24, state.player.y + 6, 0.32, 24);
        }
      }
      if (obstacle.x + obstacle.w < -40) state.dashObstacles.splice(i, 1);
    }

    while (state.dashSpawnX < W + 620) {
      spawnDashPattern();
    }
    state.dashSpawnX -= state.speed * dt;
  }

  function resolveDashPlatformCollisions(previousY) {
    const player = state.player;
    const sign = state.dashGravitySign;
    let landed = false;
    for (const platform of state.dashPlatforms) {
      if (platform.gravity !== sign) continue;
      if (player.x + 14 < platform.x || player.x - 14 > platform.x + platform.w) continue;
      const surface = sign === 1 ? platform.y : platform.y + platform.h;
      if (sign === 1) {
        const crossed = previousY + player.r <= surface + 2 && player.y + player.r >= surface;
        if (crossed && player.vy >= 0) {
          player.y = surface - player.r;
          landed = true;
        }
      } else {
        const crossed = previousY - player.r >= surface - 2 && player.y - player.r <= surface;
        if (crossed && player.vy <= 0) {
          player.y = surface + player.r;
          landed = true;
        }
      }
      if (landed) {
        player.vy = 0;
        player.onGround = true;
        break;
      }
    }

    if (player.y - player.r > H + 50 || player.y + player.r < 48) {
      crash("Missed platform.");
    }
  }

  function addDashTrail(x, y, life, size) {
    state.dashTrails.push({
      x,
      y,
      vx: -state.speed * (0.16 + seededRandom() * 0.05),
      life,
      maxLife: life,
      size: size * (0.75 + seededRandom() * 0.45),
      hue: seededRandom() > 0.48 ? "mint" : "gold",
    });
    if (state.dashTrails.length > 58) state.dashTrails.splice(0, state.dashTrails.length - 58);
  }

  function addLandingDust(x, y) {
    state.dashFlash = Math.max(state.dashFlash, 0.18);
    addFeathers(x, y, 9, 90);
    for (let i = 0; i < 4; i += 1) addDashTrail(x - i * 7, y - 8 + i * 2, 0.24, 18);
  }

  function updateDashTrails(dt) {
    for (let i = state.dashTrails.length - 1; i >= 0; i -= 1) {
      const trail = state.dashTrails[i];
      trail.x += trail.vx * dt;
      trail.life -= dt;
      if (trail.life <= 0) state.dashTrails.splice(i, 1);
    }
  }

  function updateClouds(dt, speed) {
    if (!state.clouds.length) state.clouds = makeClouds();
    for (const cloud of state.clouds) {
      cloud.x -= speed * dt;
      if (cloud.x < -140) {
        cloud.x = W + 80 + seededRandom() * 160;
        cloud.y = 52 + seededRandom() * 90;
        cloud.s = 0.8 + seededRandom() * 0.55;
      }
    }
  }

  function updateObstacles(dt) {
    for (let i = state.obstacles.length - 1; i >= 0; i -= 1) {
      const obstacle = state.obstacles[i];
      obstacle.x -= state.speed * dt;
      if (obstacle.bonus && !obstacle.bonus.collected) {
        obstacle.bonus.x = obstacle.x + obstacle.w * 0.5;
        obstacle.bonus.y += Math.sin(state.time * 7 + obstacle.x * 0.03) * dt * 10;
      }
      obstacle.wobble += dt * (1.4 + difficultyLevel() * 0.16);

      if (!obstacle.passed && obstacle.x + obstacle.w < state.player.x - state.player.r) {
        obstacle.passed = true;
        state.score += 1;
        state.message = "+1";
        addFeathers(state.player.x - 8, state.player.y, 5, 70);
        if (state.score >= DASH_START_SCORE) {
          startDashMode();
          return;
        }
      }
      if (obstacle.x + obstacle.w < -20) {
        state.obstacles.splice(i, 1);
      }
    }

    const last = state.obstacles[state.obstacles.length - 1];
    if (!last || last.x < W - obstacleSpacing()) spawnObstacle();
  }

  function updateFeathers(dt) {
    for (let i = state.feathers.length - 1; i >= 0; i -= 1) {
      const f = state.feathers[i];
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      f.vy += 130 * dt;
      f.life -= dt;
      if (f.life <= 0) state.feathers.splice(i, 1);
    }
  }

  function updateHearts(dt) {
    for (let i = state.hearts.length - 1; i >= 0; i -= 1) {
      const h = state.hearts[i];
      h.x += h.vx * dt;
      h.y += h.vy * dt;
      h.vy -= 8 * dt;
      h.life -= dt;
      if (h.life <= 0) state.hearts.splice(i, 1);
    }
  }

  function checkCollisions() {
    const player = state.player;
    if (player.y - player.r < 58) {
      player.y = player.r + 58;
      player.vy = Math.max(0, player.vy * 0.35);
    }
    if (player.y + player.r > PLAY_H) crash("Grounded.");

    for (const obstacle of state.obstacles) {
      const hitR = player.r * 0.38;
      const gapPadding = gapForgiveness();
      const currentGapY = obstacle.gapY + obstacleWobbleY(obstacle);
      const topRect = { x: obstacle.x, y: 0, w: obstacle.w, h: Math.max(0, currentGapY - gapPadding) };
      const bottomRect = {
        x: obstacle.x,
        y: currentGapY + obstacle.gapH + gapPadding,
        w: obstacle.w,
        h: PLAY_H - (currentGapY + obstacle.gapH + gapPadding),
      };
      if (circleRect(player.x, player.y, hitR, topRect) || circleRect(player.x, player.y, hitR, bottomRect)) {
        crash("Mushroom bonk.");
        return;
      }
      if (obstacle.bonus && !obstacle.bonus.collected) {
        const dx = player.x - obstacle.bonus.x;
        const dy = player.y - obstacle.bonus.y;
        if (Math.hypot(dx, dy) < player.r + obstacle.bonus.r) {
          obstacle.bonus.collected = true;
          state.score += 2;
          state.message = "+2 corn";
          addFeathers(obstacle.bonus.x, obstacle.bonus.y, 11, 110);
          if (state.score >= DASH_START_SCORE) {
            startDashMode();
            return;
          }
        }
      }
    }
  }

  function checkDashCollisions() {
    const player = state.player;
    const body = {
      x: player.x - 15,
      y: player.y - 16,
      w: 31,
      h: 32,
    };

    for (const obstacle of state.dashObstacles) {
      if (obstacle.type === "pad") {
        const padY = obstacle.gravity === 1 ? obstacle.y - 12 : obstacle.y;
        const pad = { x: obstacle.x, y: padY, w: obstacle.w, h: 24 };
        if (!obstacle.used && rectsOverlap(body, pad) && player.vy * obstacle.gravity >= -40) {
          obstacle.used = true;
          player.vy = -820 * obstacle.gravity;
          player.onGround = false;
          state.dashCoyote = 0;
          state.message = "bounce!";
          state.dashFlash = Math.max(state.dashFlash, 0.45);
          addFeathers(obstacle.x + obstacle.w * 0.5, obstacle.y, 16, 150);
          addDashTrail(player.x - 22, player.y + 4, 0.36, 26);
        }
        continue;
      }

      if (obstacle.type === "spike") {
        const spikeHit =
          obstacle.gravity === 1
            ? { x: obstacle.x + 10, y: obstacle.y - obstacle.h + 17, w: obstacle.w - 20, h: obstacle.h - 20 }
            : { x: obstacle.x + 10, y: obstacle.y + 3, w: obstacle.w - 20, h: obstacle.h - 20 };
        if (rectsOverlap(body, spikeHit)) {
          crash("Dash spike.");
          return;
        }
      } else if (obstacle.type === "portal") {
        const portal = { x: obstacle.x + 7, y: obstacle.y, w: obstacle.w - 14, h: obstacle.h };
        if (!obstacle.used && rectsOverlap(body, portal)) {
          obstacle.used = true;
          state.dashGravitySign *= -1;
          player.vy = 520 * state.dashGravitySign;
          player.onGround = false;
          state.dashCoyote = 0.08;
          state.dashFlash = Math.max(state.dashFlash, 0.75);
          state.message = state.dashGravitySign === 1 ? "floor portal!" : "ceiling portal!";
          addFeathers(player.x, player.y, 26, 190);
        }
      }
    }
  }

  function circleRect(cx, cy, r, rect) {
    const x = clamp(cx, rect.x, rect.x + rect.w);
    const y = clamp(cy, rect.y, rect.y + rect.h);
    return Math.hypot(cx - x, cy - y) <= r;
  }

  function rectsOverlap(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  function crash(message) {
    if (state.mode !== "playing") return;
    const dashStreakText = state.phase === "dash" && state.dashStreak > 0 ? ` ${state.dashStreak} streak.` : "";
    state.mode = "gameover";
    state.message = `${message}${dashStreakText}`;
    state.player.alive = false;
    state.player.vy = 0;
    state.shake = 0.28;
    addFeathers(state.player.x, state.player.y, 28, 170);
    saveBestScore();
  }

  function togglePause() {
    if (state.mode === "playing") state.mode = "paused";
    else if (state.mode === "paused") state.mode = "playing";
  }

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      canvas.requestFullscreen?.();
    } else {
      document.exitFullscreen?.();
    }
  }

  function render() {
    ctx.save();
    ctx.clearRect(0, 0, W, H);
    if (state.shake > 0) {
      const amount = state.shake * 8;
      ctx.translate((seededRandom() - 0.5) * amount, (seededRandom() - 0.5) * amount);
    }

    drawSky();
    if (state.phase === "dash") drawDashBackdrop();
    drawClouds();
    if (state.phase !== "dash") drawObstacles();
    drawGround();
    if (state.phase === "dash") {
      drawDashTrack();
      drawDashPlatforms();
      drawDashCheckpointSign();
      drawDashObstacles();
      drawDashTrails();
    }
    drawFeathers();
    drawHearts();
    if (state.mode !== "title") drawChicken();
    drawHud();

    if (state.mode === "title") drawTitle();
    if (state.mode === "paused") drawPause();
    if (state.mode === "gameover") drawGameOver();

    ctx.restore();
  }

  function drawSky() {
    if (state.phase === "dash") {
      drawDashSky();
      return;
    }

    const sky = ctx.createLinearGradient(0, 0, 0, PLAY_H);
    sky.addColorStop(0, "#bde7df");
    sky.addColorStop(0.62, "#8dcc8d");
    sky.addColorStop(1, "#79b86f");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, PLAY_H);

    ctx.fillStyle = "rgba(255,255,255,0.14)";
    for (let x = -20; x < W + 40; x += 78) {
      const y = 326 + Math.sin(x * 0.02 + state.time) * 8;
      drawHill(x, y, 120, 70);
    }
  }

  function drawDashSky() {
    const sky = ctx.createLinearGradient(0, 0, 0, PLAY_H);
    sky.addColorStop(0, "#22334f");
    sky.addColorStop(0.48, "#25706e");
    sky.addColorStop(0.78, "#73b966");
    sky.addColorStop(1, "#a7c75f");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, PLAY_H);

    ctx.save();
    ctx.globalCompositeOperation = "screen";
    const glow = ctx.createRadialGradient(W * 0.74, 118, 10, W * 0.74, 118, 190);
    glow.addColorStop(0, "rgba(255, 238, 147, 0.55)");
    glow.addColorStop(0.42, "rgba(88, 235, 194, 0.18)");
    glow.addColorStop(1, "rgba(88, 235, 194, 0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, PLAY_H);

    ctx.strokeStyle = "rgba(255, 239, 166, 0.18)";
    ctx.lineWidth = 12;
    ctx.beginPath();
    ctx.moveTo(-20, 120 + Math.sin(state.time * 1.7) * 10);
    ctx.bezierCurveTo(230, 52, 450, 176, W + 20, 92);
    ctx.stroke();
    ctx.strokeStyle = "rgba(111, 243, 204, 0.18)";
    ctx.lineWidth = 9;
    ctx.beginPath();
    ctx.moveTo(-40, 212);
    ctx.bezierCurveTo(250, 148, 478, 260, W + 40, 164);
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = "rgba(24, 49, 52, 0.3)";
    for (let x = -80; x < W + 90; x += 118) {
      const y = 338 + Math.sin(x * 0.016 + state.time * 0.7) * 6;
      drawHill(x, y, 190, 84);
    }
  }

  function drawDashBackdrop() {
    ctx.save();
    ctx.strokeStyle = "rgba(214, 255, 234, 0.16)";
    ctx.lineWidth = 2;
    for (let i = 0; i < 12; i += 1) {
      const y = 92 + i * 24;
      const x = W - ((state.time * state.speed * 0.5 + i * 97) % (W + 260));
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + 170, y - 18);
      ctx.stroke();
    }

    const horizon = PLAY_H - 88;
    ctx.strokeStyle = "rgba(255, 244, 214, 0.14)";
    ctx.lineWidth = 1.5;
    for (let y = horizon; y < PLAY_H; y += 18) {
      const spread = (y - horizon) * 4;
      ctx.beginPath();
      ctx.moveTo(W * 0.5 - spread, y);
      ctx.lineTo(W * 0.5 + spread, y);
      ctx.stroke();
    }
    for (let i = -7; i <= 7; i += 1) {
      ctx.beginPath();
      ctx.moveTo(W * 0.5 + i * 24, horizon);
      ctx.lineTo(W * 0.5 + i * 92, PLAY_H);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawHill(x, y, w, h) {
    ctx.beginPath();
    ctx.moveTo(x, PLAY_H);
    ctx.quadraticCurveTo(x + w * 0.5, y - h, x + w, PLAY_H);
    ctx.closePath();
    ctx.fill();
  }

  function drawClouds() {
    for (const cloud of state.clouds) {
      ctx.save();
      ctx.translate(cloud.x, cloud.y);
      ctx.scale(cloud.s, cloud.s);
      ctx.fillStyle = state.phase === "dash" ? "rgba(213, 255, 238, 0.5)" : "rgba(255, 247, 223, 0.72)";
      ctx.beginPath();
      ctx.arc(-34, 10, 22, 0, TWO_PI);
      ctx.arc(-8, 2, 28, 0, TWO_PI);
      ctx.arc(22, 10, 22, 0, TWO_PI);
      ctx.arc(48, 14, 16, 0, TWO_PI);
      ctx.fill();
      ctx.restore();
    }
  }

  function drawObstacles() {
    for (const obstacle of state.obstacles) {
      const wobbleY = obstacleWobbleY(obstacle);
      drawMushroomColumn(obstacle.x, obstacle.w, 0, obstacle.gapY + wobbleY, true, obstacle.capOffset);
      drawMushroomColumn(
        obstacle.x,
        obstacle.w,
        obstacle.gapY + obstacle.gapH + wobbleY,
        PLAY_H - (obstacle.gapY + obstacle.gapH + wobbleY),
        false,
        obstacle.capOffset,
      );
      if (obstacle.bonus && !obstacle.bonus.collected) drawCorn(obstacle.bonus.x, obstacle.bonus.y);
    }
  }

  function drawDashObstacles() {
    ctx.save();
    ctx.strokeStyle = "rgba(255, 244, 214, 0.16)";
    ctx.lineWidth = 2;
    for (let x = -((state.time * state.speed) % 42); x < W + 42; x += 42) {
      ctx.beginPath();
      ctx.moveTo(x, PLAY_H - 78);
      ctx.lineTo(x + 24, PLAY_H);
      ctx.stroke();
    }
    ctx.restore();

    for (const obstacle of state.dashObstacles) {
      if (["spike", "orb"].includes(obstacle.type) && !obstacle.passed && obstacle.x > state.player.x + 34 && obstacle.x < W + 100) {
        drawDashCue(obstacle);
      }
    }

    for (const obstacle of state.dashObstacles) {
      if (obstacle.type === "spike") drawDashSpike(obstacle);
      if (obstacle.type === "pad") drawBouncePad(obstacle);
      if (obstacle.type === "orb") drawJumpOrb(obstacle);
      if (obstacle.type === "portal") drawGravityPortal(obstacle);
    }
  }

  function drawDashCue(obstacle) {
    const cueX = obstacle.x - 76;
    const distance = clamp((obstacle.x - state.player.x) / 520, 0, 1);
    const alpha = 0.25 + (1 - distance) * 0.55;
    const sign = obstacle.gravity ?? 1;
    const y = obstacle.type === "orb" ? obstacle.y : obstacle.y - 66 * sign;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.shadowColor = "rgba(255, 232, 139, 0.55)";
    ctx.shadowBlur = 12;
    ctx.strokeStyle = "#ffe88b";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(cueX, y, 15 + Math.sin(state.time * 10 + obstacle.pulse) * 2, 0, TWO_PI);
    ctx.stroke();
    ctx.fillStyle = "#ffe88b";
    ctx.beginPath();
    ctx.moveTo(cueX - 9, y + 2 * sign);
    ctx.lineTo(cueX, y - 10 * sign);
    ctx.lineTo(cueX + 9, y + 2 * sign);
    ctx.lineTo(cueX + 3, y + 2 * sign);
    ctx.lineTo(cueX + 3, y + 13 * sign);
    ctx.lineTo(cueX - 3, y + 13 * sign);
    ctx.lineTo(cueX - 3, y + 2 * sign);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawDashSpike(obstacle) {
    const x = obstacle.x;
    const y = obstacle.y;
    ctx.save();
    if (obstacle.gravity === -1) {
      ctx.translate(x + obstacle.w * 0.5, y);
      ctx.scale(1, -1);
      ctx.translate(-(x + obstacle.w * 0.5), -y);
    }
    ctx.fillStyle = "rgba(8, 18, 22, 0.32)";
    ctx.beginPath();
    ctx.ellipse(x + obstacle.w * 0.5 + 4, y + 5, obstacle.w * 0.58, 8, 0, 0, TWO_PI);
    ctx.fill();

    const stem = ctx.createLinearGradient(x + 8, y - 26, x + obstacle.w - 8, y);
    stem.addColorStop(0, "#fff1c7");
    stem.addColorStop(0.55, "#d7aa76");
    stem.addColorStop(1, "#8b603c");
    ctx.fillStyle = stem;
    roundedRect(x + 8, y - 25, obstacle.w - 16, 27, 7);
    ctx.fill();

    ctx.shadowColor = "rgba(255, 101, 124, 0.42)";
    ctx.shadowBlur = 14;
    const grad = ctx.createLinearGradient(x, y - obstacle.h, x, y);
    grad.addColorStop(0, "#ff8690");
    grad.addColorStop(0.5, "#d83c58");
    grad.addColorStop(1, "#7b243f");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(x + obstacle.w * 0.5, y - obstacle.h);
    ctx.bezierCurveTo(x + obstacle.w * 0.88, y - 25, x + obstacle.w + 3, y - 6, x + obstacle.w, y);
    ctx.quadraticCurveTo(x + obstacle.w * 0.5, y - 8, x, y);
    ctx.bezierCurveTo(x - 3, y - 7, x + obstacle.w * 0.12, y - 25, x + obstacle.w * 0.5, y - obstacle.h);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.fillStyle = "rgba(255, 246, 222, 0.9)";
    ctx.beginPath();
    ctx.arc(x + obstacle.w * 0.42, y - obstacle.h * 0.44, 4, 0, TWO_PI);
    ctx.arc(x + obstacle.w * 0.63, y - obstacle.h * 0.26, 3.5, 0, TWO_PI);
    ctx.arc(x + obstacle.w * 0.37, y - obstacle.h * 0.14, 3, 0, TWO_PI);
    ctx.fill();

    ctx.strokeStyle = "rgba(255, 239, 188, 0.58)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x + obstacle.w * 0.5, y - obstacle.h + 8);
    ctx.lineTo(x + obstacle.w * 0.48, y - 7);
    ctx.stroke();
    ctx.strokeStyle = "rgba(29, 29, 33, 0.34)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x + obstacle.w * 0.5, y - obstacle.h);
    ctx.bezierCurveTo(x + obstacle.w * 0.88, y - 25, x + obstacle.w + 3, y - 6, x + obstacle.w, y);
    ctx.quadraticCurveTo(x + obstacle.w * 0.5, y - 8, x, y);
    ctx.bezierCurveTo(x - 3, y - 7, x + obstacle.w * 0.12, y - 25, x + obstacle.w * 0.5, y - obstacle.h);
    ctx.stroke();
    ctx.restore();
  }

  function drawJumpOrb(obstacle) {
    const x = obstacle.x;
    const y = obstacle.y;
    const pulse = 1 + Math.sin(state.time * 9 + obstacle.pulse) * 0.08;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(pulse, pulse);
    ctx.globalAlpha = obstacle.used ? 0.35 : 1;
    ctx.shadowColor = "rgba(255, 232, 139, 0.68)";
    ctx.shadowBlur = 18;
    ctx.strokeStyle = "#ffe88b";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(0, 0, 18, 0, TWO_PI);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#5feec1";
    ctx.beginPath();
    ctx.arc(0, 0, 8, 0, TWO_PI);
    ctx.fill();
    ctx.fillStyle = "#17303a";
    ctx.beginPath();
    ctx.moveTo(-5, 2);
    ctx.lineTo(0, -7);
    ctx.lineTo(5, 2);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawGravityPortal(obstacle) {
    const x = obstacle.x;
    const y = obstacle.y;
    const w = obstacle.w;
    const h = obstacle.h;
    const pulse = 0.5 + Math.sin(state.time * 7 + obstacle.pulse) * 0.5;
    ctx.save();
    ctx.shadowColor = "rgba(95, 238, 193, 0.6)";
    ctx.shadowBlur = 16 + pulse * 10;
    const grad = ctx.createLinearGradient(x, y, x + w, y + h);
    grad.addColorStop(0, "#5feec1");
    grad.addColorStop(0.46, "#ffe88b");
    grad.addColorStop(1, "#ff6f8b");
    ctx.strokeStyle = grad;
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.ellipse(x + w * 0.5, y + h * 0.5, w * 0.42, h * 0.5, 0, 0, TWO_PI);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = "rgba(255, 244, 214, 0.8)";
    ctx.lineWidth = 2;
    for (let i = 0; i < 3; i += 1) {
      const yy = y + h * (0.28 + i * 0.22);
      ctx.beginPath();
      ctx.moveTo(x + w * 0.28, yy);
      ctx.lineTo(x + w * 0.72, yy);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawDashBlock(obstacle) {
    const x = obstacle.x;
    const y = obstacle.y;
    const w = obstacle.w;
    const h = obstacle.h;
    ctx.save();
    ctx.fillStyle = "rgba(8, 18, 22, 0.32)";
    ctx.beginPath();
    ctx.ellipse(x + w * 0.5 + 5, y + h + 4, w * 0.6, 9, 0, 0, TWO_PI);
    ctx.fill();

    const stem = ctx.createLinearGradient(x + 6, y + 12, x + w - 6, y + h);
    stem.addColorStop(0, "#fff0ca");
    stem.addColorStop(0.5, "#c99565");
    stem.addColorStop(1, "#765239");
    ctx.fillStyle = stem;
    roundedRect(x + 7, y + 13, w - 14, h - 12, 8);
    ctx.fill();

    ctx.shadowColor = "rgba(255, 94, 112, 0.35)";
    ctx.shadowBlur = 12;
    const cap = ctx.createLinearGradient(x - 6, y - 2, x + w + 6, y + 28);
    cap.addColorStop(0, "#ff8a7a");
    cap.addColorStop(0.5, "#cb4054");
    cap.addColorStop(1, "#82304b");
    ctx.fillStyle = cap;
    ctx.beginPath();
    ctx.moveTo(x - 8, y + 23);
    ctx.bezierCurveTo(x - 3, y + 2, x + w * 0.26, y - 7, x + w * 0.5, y - 4);
    ctx.bezierCurveTo(x + w * 0.76, y - 8, x + w + 7, y + 2, x + w + 8, y + 23);
    ctx.quadraticCurveTo(x + w * 0.5, y + 34, x - 8, y + 23);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.fillStyle = "#ead6b8";
    ctx.beginPath();
    ctx.ellipse(x + w * 0.5, y + 24, w * 0.48, 9, 0, 0, TWO_PI);
    ctx.fill();

    ctx.strokeStyle = "rgba(93, 60, 42, 0.24)";
    ctx.lineWidth = 2;
    for (let i = -2; i <= 2; i += 1) {
      ctx.beginPath();
      ctx.moveTo(x + w * 0.5, y + 24);
      ctx.lineTo(x + w * 0.5 + i * 8, y + 31);
      ctx.stroke();
    }

    ctx.fillStyle = "rgba(255, 246, 222, 0.86)";
    ctx.beginPath();
    ctx.arc(x + w * 0.27, y + 13, 5, 0, TWO_PI);
    ctx.arc(x + w * 0.61, y + 9, 4, 0, TWO_PI);
    ctx.arc(x + w * 0.75, y + 20, 3.5, 0, TWO_PI);
    ctx.fill();

    ctx.strokeStyle = "rgba(24, 29, 33, 0.3)";
    ctx.lineWidth = 3;
    roundedRect(x + 7, y + 13, w - 14, h - 12, 8);
    ctx.stroke();
    ctx.restore();
  }

  function drawBouncePad(obstacle) {
    const x = obstacle.x;
    const baseY = obstacle.y;
    ctx.save();
    if (obstacle.gravity === -1) {
      ctx.translate(x + obstacle.w * 0.5, baseY);
      ctx.scale(1, -1);
      ctx.translate(-(x + obstacle.w * 0.5), -baseY);
    }
    const y = baseY - obstacle.h;
    ctx.fillStyle = "rgba(8, 18, 22, 0.28)";
    ctx.beginPath();
    ctx.ellipse(x + obstacle.w * 0.5, baseY + 3, obstacle.w * 0.55, 8, 0, 0, TWO_PI);
    ctx.fill();

    ctx.shadowColor = "rgba(118, 255, 192, 0.58)";
    ctx.shadowBlur = 12;
    const pad = ctx.createLinearGradient(x, y - 2, x, y + obstacle.h + 8);
    pad.addColorStop(0, "#fff088");
    pad.addColorStop(0.52, "#69ec9c");
    pad.addColorStop(1, "#2a9b84");
    ctx.fillStyle = pad;
    roundedRect(x, y, obstacle.w, obstacle.h, 7);
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.strokeStyle = "#fff4d6";
    ctx.lineWidth = 4;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(x + 13, y + 2);
    ctx.lineTo(x + obstacle.w * 0.36, y - 16);
    ctx.lineTo(x + obstacle.w * 0.55, y + 1);
    ctx.lineTo(x + obstacle.w * 0.74, y - 16);
    ctx.lineTo(x + obstacle.w - 10, y + 2);
    ctx.stroke();
    ctx.lineCap = "butt";

    ctx.fillStyle = "#d94259";
    ctx.beginPath();
    ctx.ellipse(x + obstacle.w * 0.5, y - 19, 18, 10, 0, Math.PI, TWO_PI);
    ctx.lineTo(x + obstacle.w * 0.5 + 14, y - 17);
    ctx.quadraticCurveTo(x + obstacle.w * 0.5, y - 7, x + obstacle.w * 0.5 - 14, y - 17);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "rgba(255, 246, 222, 0.84)";
    ctx.beginPath();
    ctx.arc(x + obstacle.w * 0.42, y - 19, 3, 0, TWO_PI);
    ctx.arc(x + obstacle.w * 0.56, y - 22, 2.5, 0, TWO_PI);
    ctx.fill();
    ctx.restore();
  }

  function drawMushroomColumn(x, w, y, h, top, offset) {
    if (h <= 0) return;
    const cx = x + w * 0.5;
    const capY = top ? y + h - 7 : y + 7;
    const capW = w * 1.34;
    const capH = 38;
    const stemTop = top ? y - 8 : capY + 18;
    const stemBottom = top ? capY - 18 : y + h + 8;
    const stemLeft = x + w * 0.28;
    const stemRight = x + w * 0.72;

    ctx.save();
    ctx.fillStyle = "rgba(39, 49, 57, 0.18)";
    ctx.beginPath();
    ctx.ellipse(cx + 6, top ? capY + 18 : Math.min(PLAY_H - 5, stemBottom), w * 0.42, 10, 0, 0, TWO_PI);
    ctx.fill();

    const stem = ctx.createLinearGradient(stemLeft, y, stemRight, y);
    stem.addColorStop(0, "#c99f73");
    stem.addColorStop(0.28, "#f1dfbd");
    stem.addColorStop(0.58, "#fff0cc");
    stem.addColorStop(1, "#a97850");
    ctx.fillStyle = stem;
    ctx.beginPath();
    ctx.moveTo(stemLeft + 8, stemTop);
    ctx.bezierCurveTo(stemLeft - 4, y + h * 0.22, stemLeft + 8, y + h * 0.72, stemLeft + 2, stemBottom);
    ctx.quadraticCurveTo(cx, stemBottom + (top ? -8 : 14), stemRight - 2, stemBottom);
    ctx.bezierCurveTo(stemRight - 8, y + h * 0.72, stemRight + 5, y + h * 0.22, stemRight - 8, stemTop);
    ctx.quadraticCurveTo(cx, stemTop + (top ? -13 : 8), stemLeft + 8, stemTop);
    ctx.fill();

    ctx.strokeStyle = "rgba(78, 51, 35, 0.22)";
    ctx.lineWidth = 2;
    for (let i = 0; i < 4; i += 1) {
      const px = stemLeft + 13 + i * ((stemRight - stemLeft - 26) / 3);
      ctx.beginPath();
      ctx.moveTo(px, stemTop + 16);
      ctx.bezierCurveTo(px - 8, y + h * 0.36, px + 10, y + h * 0.64, px - 3, stemBottom - 18);
      ctx.stroke();
    }

    ctx.fillStyle = "rgba(103, 70, 47, 0.18)";
    for (let yy = y + 22 + offset; yy < y + h - 18; yy += 42) {
      ctx.beginPath();
      ctx.ellipse(stemLeft + 14, yy, 5, 11, 0.36, 0, TWO_PI);
      ctx.ellipse(stemRight - 11, yy + 15, 4, 9, -0.24, 0, TWO_PI);
      ctx.fill();
      if (yy > y + 50 && yy < y + h - 52) drawShelfMushroom(cx + (yy % 84 > 42 ? -w * 0.32 : w * 0.32), yy, yy % 84 > 42);
    }

    drawCap(cx, capY, capW, capH, top);
    ctx.restore();
  }

  function drawShelfMushroom(x, y, left) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(left ? -1 : 1, 1);
    ctx.fillStyle = "#e8d0aa";
    roundedRect(-2, -2, 8, 20, 4);
    ctx.fill();
    ctx.fillStyle = "#c23f54";
    ctx.beginPath();
    ctx.ellipse(8, -3, 20, 10, -0.1, Math.PI, TWO_PI);
    ctx.quadraticCurveTo(22, 10, 8, 8);
    ctx.quadraticCurveTo(-7, 9, -12, -2);
    ctx.fill();
    ctx.fillStyle = "rgba(255, 244, 214, 0.7)";
    ctx.beginPath();
    ctx.arc(3, -3, 3, 0, TWO_PI);
    ctx.arc(12, -5, 2.5, 0, TWO_PI);
    ctx.fill();
    ctx.restore();
  }

  function drawCap(cx, capY, capW, capH, top) {
    const capGrad = ctx.createLinearGradient(cx - capW * 0.45, capY - capH, cx + capW * 0.45, capY + capH);
    capGrad.addColorStop(0, "#e75968");
    capGrad.addColorStop(0.42, "#bd344c");
    capGrad.addColorStop(1, "#7d263c");
    ctx.fillStyle = capGrad;
    ctx.beginPath();
    if (top) {
      ctx.moveTo(cx - capW * 0.52, capY - 4);
      ctx.bezierCurveTo(cx - capW * 0.34, capY + capH * 0.92, cx + capW * 0.34, capY + capH * 0.92, cx + capW * 0.52, capY - 4);
      ctx.quadraticCurveTo(cx + capW * 0.18, capY + capH * 0.18, cx, capY + capH * 0.18);
      ctx.quadraticCurveTo(cx - capW * 0.18, capY + capH * 0.18, cx - capW * 0.52, capY - 4);
    } else {
      ctx.moveTo(cx - capW * 0.52, capY + 4);
      ctx.bezierCurveTo(cx - capW * 0.34, capY - capH * 0.92, cx + capW * 0.34, capY - capH * 0.92, cx + capW * 0.52, capY + 4);
      ctx.quadraticCurveTo(cx + capW * 0.18, capY - capH * 0.18, cx, capY - capH * 0.18);
      ctx.quadraticCurveTo(cx - capW * 0.18, capY - capH * 0.18, cx - capW * 0.52, capY + 4);
    }
    ctx.fill();

    ctx.fillStyle = "#ead6b8";
    ctx.beginPath();
    ctx.ellipse(cx, capY + (top ? -5 : 5), capW * 0.38, capH * 0.22, 0, 0, TWO_PI);
    ctx.fill();

    ctx.strokeStyle = "rgba(92, 58, 43, 0.35)";
    ctx.lineWidth = 2;
    for (let i = -4; i <= 4; i += 1) {
      const gx = cx + i * capW * 0.07;
      ctx.beginPath();
      ctx.moveTo(cx, capY + (top ? -4 : 4));
      ctx.lineTo(gx, capY + (top ? -13 : 13));
      ctx.stroke();
    }

    ctx.fillStyle = "rgba(255, 246, 222, 0.8)";
    const spots = [
      [-0.28, top ? 0.12 : -0.12, 7],
      [-0.08, top ? 0.24 : -0.24, 5],
      [0.16, top ? 0.16 : -0.16, 8],
      [0.34, top ? -0.02 : 0.02, 5],
    ];
    for (const [sx, sy, r] of spots) {
      ctx.beginPath();
      ctx.ellipse(cx + sx * capW, capY + sy * capH, r, r * 0.72, 0.16, 0, TWO_PI);
      ctx.fill();
    }

    ctx.strokeStyle = "rgba(39, 49, 57, 0.2)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(cx, capY + (top ? 4 : -4), capW * 0.52, capH * 0.58, 0, 0, TWO_PI);
    ctx.stroke();
  }

  function drawCorn(x, y) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.sin(state.time * 5 + x) * 0.15);
    ctx.fillStyle = "#ffe66a";
    ctx.beginPath();
    ctx.ellipse(0, 0, 9, 14, 0, 0, TWO_PI);
    ctx.fill();
    ctx.fillStyle = "#5ca45d";
    ctx.beginPath();
    ctx.ellipse(-8, 4, 5, 12, -0.6, 0, TWO_PI);
    ctx.ellipse(8, 4, 5, 12, 0.6, 0, TWO_PI);
    ctx.fill();
    ctx.restore();
  }

  function drawGround() {
    if (state.phase === "dash") {
      drawDashGround();
      return;
    }

    ctx.fillStyle = "#6da45e";
    ctx.fillRect(0, PLAY_H, W, GROUND_H);
    ctx.fillStyle = "#4d7a43";
    ctx.fillRect(0, PLAY_H, W, 8);
    ctx.fillStyle = "#d5a35f";
    for (let x = -20 - ((state.time * state.speed) % 56); x < W + 60; x += 56) {
      roundedRect(x, PLAY_H + 22, 36, 10, 4);
      ctx.fill();
    }
  }

  function drawDashGround() {
    const ground = ctx.createLinearGradient(0, PLAY_H, 0, H);
    ground.addColorStop(0, "#24483f");
    ground.addColorStop(0.42, "#182d34");
    ground.addColorStop(1, "#10181f");
    ctx.fillStyle = ground;
    ctx.fillRect(0, PLAY_H, W, GROUND_H);

    ctx.fillStyle = "rgba(255, 232, 139, 0.72)";
    ctx.fillRect(0, PLAY_H, W, 5);
    ctx.fillStyle = "rgba(95, 239, 191, 0.22)";
    for (let x = -20 - ((state.time * state.speed * 0.45) % 74); x < W + 80; x += 74) {
      roundedRect(x, PLAY_H + 20, 48, 9, 4);
      ctx.fill();
    }
  }

  function drawDashTrack() {
    const top = PLAY_H - 86;
    const bottom = PLAY_H + 8;
    ctx.save();
    const track = ctx.createLinearGradient(0, top, 0, bottom);
    track.addColorStop(0, "rgba(29, 59, 61, 0.15)");
    track.addColorStop(0.28, "rgba(30, 71, 67, 0.9)");
    track.addColorStop(0.72, "rgba(17, 37, 44, 0.96)");
    track.addColorStop(1, "rgba(12, 22, 29, 1)");
    ctx.fillStyle = track;
    ctx.beginPath();
    ctx.moveTo(0, top + 22);
    ctx.lineTo(W, top);
    ctx.lineTo(W, bottom);
    ctx.lineTo(0, bottom);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = "rgba(108, 246, 201, 0.72)";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(0, top + 22);
    ctx.lineTo(W, top);
    ctx.stroke();
    ctx.strokeStyle = "rgba(255, 232, 139, 0.78)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, dashGroundY() + 3);
    ctx.lineTo(W, dashGroundY() - 13);
    ctx.stroke();

    const offset = (state.time * state.speed) % 68;
    for (let x = -80 - offset; x < W + 100; x += 68) {
      const alpha = 0.28 + ((Math.floor((x + offset) / 68) % 2) * 0.16);
      ctx.fillStyle = `rgba(255, 244, 214, ${alpha})`;
      ctx.beginPath();
      ctx.moveTo(x, top + 38);
      ctx.lineTo(x + 42, top + 34);
      ctx.lineTo(x + 66, bottom);
      ctx.lineTo(x + 22, bottom);
      ctx.closePath();
      ctx.fill();
    }

    if (state.dashFlash > 0) {
      const p = state.player;
      const radius = 130 * state.dashFlash + 34;
      const glow = ctx.createRadialGradient(p.x, p.y, 6, p.x, p.y, radius);
      glow.addColorStop(0, `rgba(255, 236, 126, ${0.45 * state.dashFlash})`);
      glow.addColorStop(0.42, `rgba(95, 239, 191, ${0.24 * state.dashFlash})`);
      glow.addColorStop(1, "rgba(95, 239, 191, 0)");
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, W, H);
    }
    ctx.restore();
  }

  function drawDashPlatforms() {
    for (const platform of state.dashPlatforms) {
      ctx.save();
      const top = platform.y;
      const surface = platform.gravity === 1 ? platform.y : platform.y + platform.h;
      ctx.fillStyle = "rgba(8, 18, 22, 0.26)";
      roundedRect(platform.x + 5, platform.y + 7 * platform.gravity, platform.w, platform.h, 5);
      ctx.fill();

      const grad = ctx.createLinearGradient(platform.x, top, platform.x, top + platform.h);
      grad.addColorStop(0, platform.gravity === 1 ? "#ffe88b" : "#203747");
      grad.addColorStop(0.18, "#5feec1");
      grad.addColorStop(0.56, "#244b51");
      grad.addColorStop(1, platform.gravity === 1 ? "#15232c" : "#ffe88b");
      ctx.fillStyle = grad;
      roundedRect(platform.x, platform.y, platform.w, platform.h, 4);
      ctx.fill();

      ctx.strokeStyle = "rgba(255, 244, 214, 0.72)";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(platform.x, surface);
      ctx.lineTo(platform.x + platform.w, surface);
      ctx.stroke();

      ctx.fillStyle = "rgba(255, 244, 214, 0.16)";
      const tileOffset = (state.time * state.speed * 0.22 + platform.pulse * 12) % 38;
      for (let x = platform.x - tileOffset; x < platform.x + platform.w; x += 38) {
        ctx.fillRect(x, platform.y + 6, 18, Math.max(4, platform.h - 12));
      }
      ctx.restore();
    }
  }

  function drawDashCheckpointSign() {
    if (!state.checkpointUnlocked) return;
    const x = 48;
    const y = PLAY_H - 142;
    const pulse = 0.5 + Math.sin(state.time * 5) * 0.5;
    ctx.save();
    ctx.shadowColor = "rgba(255, 232, 139, 0.5)";
    ctx.shadowBlur = 10 + pulse * 8;
    ctx.strokeStyle = "#ffe88b";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(x, y + 22);
    ctx.lineTo(x, dashGroundY() + 4);
    ctx.stroke();

    const flag = ctx.createLinearGradient(x + 4, y, x + 102, y + 46);
    flag.addColorStop(0, "#fff0a0");
    flag.addColorStop(0.5, "#5feec1");
    flag.addColorStop(1, "#2f97a0");
    ctx.fillStyle = flag;
    ctx.beginPath();
    ctx.moveTo(x + 2, y + 22);
    ctx.lineTo(x + 106, y + 10);
    ctx.lineTo(x + 94, y + 54);
    ctx.lineTo(x + 2, y + 48);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#17303a";
    ctx.font = "900 16px Inter, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("50", x + 54, y + 38);
    ctx.restore();
  }

  function drawDashTrails() {
    for (const trail of state.dashTrails) {
      const alpha = clamp(trail.life / trail.maxLife, 0, 1);
      ctx.save();
      ctx.globalAlpha = alpha * 0.72;
      ctx.fillStyle = trail.hue === "mint" ? "#5feec1" : "#ffe88b";
      ctx.shadowColor = trail.hue === "mint" ? "rgba(95, 238, 193, 0.5)" : "rgba(255, 232, 139, 0.5)";
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.ellipse(trail.x, trail.y, trail.size, trail.size * 0.26, -0.08, 0, TWO_PI);
      ctx.fill();
      ctx.restore();
    }
  }

  function drawFeathers() {
    for (const f of state.feathers) {
      ctx.save();
      ctx.globalAlpha = clamp(f.life / f.maxLife, 0, 1);
      ctx.translate(f.x, f.y);
      ctx.rotate(f.vx * 0.02);
      ctx.fillStyle = "#fff4d6";
      ctx.beginPath();
      ctx.ellipse(0, 0, f.size, f.size * 0.45, 0, 0, TWO_PI);
      ctx.fill();
      ctx.restore();
    }
  }

  function drawHearts() {
    for (const h of state.hearts) {
      ctx.save();
      ctx.globalAlpha = clamp(h.life / h.maxLife, 0, 1);
      ctx.translate(h.x, h.y);
      ctx.scale(h.size / 10, h.size / 10);
      ctx.fillStyle = "#ff7f98";
      ctx.beginPath();
      ctx.moveTo(0, 8);
      ctx.bezierCurveTo(-14, -2, -8, -14, 0, -7);
      ctx.bezierCurveTo(8, -14, 14, -2, 0, 8);
      ctx.fill();
      ctx.restore();
    }
  }

  function drawChicken() {
    const p = state.player;
    const pulse = p.flapPulse > 0 ? p.flapPulse * 22 : 0;
    const gravityFlip = state.phase === "dash" ? state.dashGravitySign : 1;
    const bob = Math.sin(state.time * 9) * 1.4 * gravityFlip;
    ctx.save();
    ctx.translate(p.x, p.y + bob);
    ctx.rotate(p.angle);
    if (gravityFlip === -1) ctx.scale(1, -1);

    ctx.fillStyle = "rgba(39, 49, 57, 0.22)";
    ctx.beginPath();
    ctx.ellipse(-4, p.r + 14, p.r * 0.92, 7, 0, 0, TWO_PI);
    ctx.fill();

    if (state.phase === "dash") {
      const scarfWave = Math.sin(state.time * 16) * 3;
      ctx.fillStyle = "#5feec1";
      ctx.beginPath();
      ctx.moveTo(-12, -6);
      ctx.quadraticCurveTo(-36, -18 + scarfWave, -60, -7);
      ctx.quadraticCurveTo(-38, 2 + scarfWave, -12, 4);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#ffe88b";
      ctx.beginPath();
      ctx.ellipse(-53, -6 + scarfWave, 7, 4, -0.2, 0, TWO_PI);
      ctx.fill();
    }

    ctx.fillStyle = "#fff7df";
    ctx.beginPath();
    ctx.ellipse(0, 0, p.r * 1.1, p.r * 0.95, -0.05, 0, TWO_PI);
    ctx.fill();

    ctx.fillStyle = "#fffdf2";
    ctx.beginPath();
    ctx.ellipse(7, -4, p.r * 0.78, p.r * 0.62, -0.02, 0, TWO_PI);
    ctx.fill();

    ctx.fillStyle = "#f8e1a8";
    ctx.beginPath();
    ctx.ellipse(-8, 6 + pulse * 0.08, p.r * 0.52, p.r * 0.32 + pulse * 0.08, -0.45, 0, TWO_PI);
    ctx.fill();

    ctx.fillStyle = "#c83d36";
    ctx.beginPath();
    ctx.arc(-6, -p.r * 0.82, 6.5, 0, TWO_PI);
    ctx.arc(2, -p.r * 0.98, 6, 0, TWO_PI);
    ctx.arc(10, -p.r * 0.8, 5.5, 0, TWO_PI);
    ctx.fill();

    ctx.fillStyle = "#efaa31";
    ctx.beginPath();
    ctx.moveTo(p.r * 0.85, -1);
    ctx.lineTo(p.r * 1.3, -8);
    ctx.lineTo(p.r * 1.3, 7);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "#ffb1bc";
    ctx.beginPath();
    ctx.arc(1, 4, 4, 0, TWO_PI);
    ctx.fill();

    ctx.fillStyle = "#273139";
    ctx.beginPath();
    ctx.arc(9, -8, 4.2, 0, TWO_PI);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(10.6, -9.6, 1.35, 0, TWO_PI);
    ctx.fill();

    if (state.phase === "dash") {
      ctx.strokeStyle = "#5feec1";
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.ellipse(9, -8, 7.4, 6, 0, 0, TWO_PI);
      ctx.stroke();
      ctx.strokeStyle = "rgba(47, 151, 160, 0.76)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-5, -9);
      ctx.lineTo(2, -9);
      ctx.moveTo(16, -9);
      ctx.lineTo(26, -12);
      ctx.stroke();
    }

    ctx.strokeStyle = "#273139";
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(13, -14);
    ctx.quadraticCurveTo(16, -17, 19, -13);
    ctx.stroke();

    ctx.strokeStyle = "#efaa31";
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    const footY = p.r * 0.78;
    ctx.beginPath();
    ctx.moveTo(-8, footY);
    ctx.lineTo(-13, footY + 7);
    ctx.moveTo(6, footY);
    ctx.lineTo(1, footY + 7);
    ctx.stroke();
    ctx.lineCap = "butt";
    ctx.restore();
  }

  function drawHud() {
    ctx.save();
    ctx.fillStyle = "rgba(23, 29, 31, 0.86)";
    ctx.fillRect(0, 0, W, 58);
    ctx.fillStyle = "#fff4d6";
    ctx.font = "800 18px Inter, system-ui, sans-serif";
    ctx.fillText("Chicken Flap", 22, 24);
    ctx.fillStyle = "#f7d35c";
    ctx.font = "800 12px Inter, system-ui, sans-serif";
    ctx.fillText("- For My Sexy Girlfriend Ella", 22, 42);

    ctx.textAlign = "center";
    ctx.font = "900 32px Inter, system-ui, sans-serif";
    ctx.fillStyle = "#fff4d6";
    ctx.fillText(String(state.score), W / 2, 40);
    ctx.font = "900 11px Inter, system-ui, sans-serif";
    ctx.fillStyle = "#9ee68c";
    ctx.fillText(difficultyLabel(), W / 2, 54);

    ctx.textAlign = "right";
    ctx.font = "800 14px Inter, system-ui, sans-serif";
    ctx.fillStyle = "#fff4d6";
    ctx.fillText(`Best ${state.best}`, W - 26, 25);
    ctx.fillStyle = "rgba(255, 244, 214, 0.78)";
    ctx.font = "700 12px Inter, system-ui, sans-serif";
    ctx.fillText(
      state.phase === "dash"
        ? `Checkpoint 50   Streak ${state.dashStreak}   Space / click jump`
        : "Space / click to flap   P pause   R restart",
      W - 26,
      43,
    );
    ctx.restore();
  }

  function drawTitle() {
    drawOverlay(0.45);
    ctx.save();
    ctx.textAlign = "center";
    ctx.fillStyle = "#fff4d6";
    ctx.font = "900 56px Inter, system-ui, sans-serif";
    ctx.fillText("Chicken Flap", W / 2, 150);
    ctx.fillStyle = "#f7d35c";
    ctx.font = "900 28px Inter, system-ui, sans-serif";
    ctx.fillText("- For My Sexy Girlfriend Ella", W / 2, 190);
    ctx.fillStyle = "rgba(255, 244, 214, 0.92)";
    ctx.font = "700 20px Inter, system-ui, sans-serif";
    ctx.fillText("Flap through mushroom gaps. At 50, it becomes Chicken Dash.", W / 2, 245);
    drawButton(W / 2 - 120, 292, 240, 58, "Start Flapping");
    ctx.fillStyle = "rgba(255, 244, 214, 0.82)";
    ctx.font = "700 16px Inter, system-ui, sans-serif";
    ctx.fillText("Space, click, or tap to flap. After 50, tap to jump.", W / 2, 392);
    ctx.restore();
  }

  function drawPause() {
    drawOverlay(0.45);
    ctx.save();
    ctx.textAlign = "center";
    ctx.fillStyle = "#fff4d6";
    ctx.font = "900 44px Inter, system-ui, sans-serif";
    ctx.fillText("Paused", W / 2, 230);
    ctx.font = "700 18px Inter, system-ui, sans-serif";
    ctx.fillText("Press P to continue.", W / 2, 270);
    ctx.restore();
  }

  function drawGameOver() {
    drawOverlay(0.48);
    ctx.save();
    ctx.textAlign = "center";
    ctx.fillStyle = "#fff4d6";
    ctx.font = "900 48px Inter, system-ui, sans-serif";
    ctx.fillText("Mushroom Crash", W / 2, 200);
    ctx.fillStyle = "#f7d35c";
    ctx.font = "900 28px Inter, system-ui, sans-serif";
    ctx.fillText(`Score ${state.score}`, W / 2, 248);
    ctx.fillStyle = "rgba(255, 244, 214, 0.88)";
    ctx.font = "700 18px Inter, system-ui, sans-serif";
    ctx.fillText(`${state.message}  Best ${state.best}`, W / 2, 286);
    ctx.fillStyle = state.checkpointUnlocked ? "#9ee68c" : "rgba(255, 244, 214, 0.72)";
    ctx.font = "800 16px Inter, system-ui, sans-serif";
    ctx.fillText(state.checkpointUnlocked ? "Checkpoint saved: restart at Chicken Dash." : "Reach 50 to save the Dash checkpoint.", W / 2, 318);
    drawButton(W / 2 - 112, 350, 224, 54, state.checkpointUnlocked ? "Restart Dash" : "Try Again");
    ctx.restore();
  }

  function drawButton(x, y, w, h, label) {
    ctx.fillStyle = "#f7d35c";
    roundedRect(x, y, w, h, 8);
    ctx.fill();
    ctx.fillStyle = "#372817";
    ctx.font = "900 20px Inter, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(label, x + w / 2, y + 35);
  }

  function drawOverlay(alpha) {
    ctx.fillStyle = `rgba(18, 23, 25, ${alpha})`;
    ctx.fillRect(0, 0, W, H);
  }

  function roundedRect(x, y, w, h, r) {
    const radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + w - radius, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
    ctx.lineTo(x + w, y + h - radius);
    ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
    ctx.lineTo(x + radius, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
  }

  function renderGameToText() {
    const nextFlapObstacle = state.obstacles.find((o) => o.x + o.w >= state.player.x - state.player.r);
    const nextDashObstacle = state.dashObstacles.find((o) => o.x + o.w >= state.player.x - state.player.r);
    const nextDashPlatform = state.dashPlatforms.find((p) => p.x + p.w >= state.player.x - state.player.r);
    const payload = {
      title: TITLE,
      coordinateSystem: "origin top-left, x right, y down, units canvas pixels, size 960x540",
      mode: state.mode,
      phase: state.phase,
      objective:
        state.phase === "dash"
          ? "tap to jump over mushroom spikes and blocks in Chicken Dash mode"
          : "tap to flap through mushroom gaps; score 50 unlocks Chicken Dash mode",
      score: state.score,
      best: state.best,
      checkpointUnlocked: state.checkpointUnlocked,
      checkpointScore: state.checkpointUnlocked ? DASH_START_SCORE : null,
      difficulty: { level: state.phase === "dash" ? dashLevel() : difficultyLevel(), label: difficultyLabel() },
      dashStreak: state.dashStreak,
      dashJumpBuffer: Number(state.dashJumpBuffer.toFixed(2)),
      dashCoyote: Number(state.dashCoyote.toFixed(2)),
      dashGravity: state.dashGravitySign === 1 ? "floor" : "ceiling",
      speed: Math.round(state.speed),
      gapForgiveness: Number(gapForgiveness().toFixed(1)),
      obstacleSpacing: Math.round(obstacleSpacing()),
      player: {
        x: Math.round(state.player.x),
        y: Math.round(state.player.y),
        vy: Math.round(state.player.vy),
        r: state.player.r,
        onGround: state.player.onGround,
      },
      nextObstacle: nextFlapObstacle
        ? {
            x: Math.round(nextFlapObstacle.x),
            w: nextFlapObstacle.w,
            gapY: Math.round(nextFlapObstacle.gapY),
            gapH: Math.round(nextFlapObstacle.gapH),
            passed: nextFlapObstacle.passed,
            bonus: nextFlapObstacle.bonus && !nextFlapObstacle.bonus.collected,
          }
        : null,
      nextDashObstacle: nextDashObstacle
        ? {
            type: nextDashObstacle.type,
            x: Math.round(nextDashObstacle.x),
            y: Math.round(nextDashObstacle.y),
            w: nextDashObstacle.w,
            h: nextDashObstacle.h,
            gravity: nextDashObstacle.gravity === 1 ? "floor" : "ceiling",
            passed: nextDashObstacle.passed,
          }
        : null,
      nextDashPlatform: nextDashPlatform
        ? {
            x: Math.round(nextDashPlatform.x),
            y: Math.round(nextDashPlatform.y),
            surfaceY: Math.round(nextDashPlatform.surfaceY),
            w: Math.round(nextDashPlatform.w),
            h: nextDashPlatform.h,
            gravity: nextDashPlatform.gravity === 1 ? "floor" : "ceiling",
          }
        : null,
      dashPlatforms: state.dashPlatforms
        .filter((p) => p.x + p.w >= state.player.x - state.player.r && p.x < W + 80)
        .slice(0, 5)
        .map((p) => ({
          x: Math.round(p.x),
          y: Math.round(p.y),
          surfaceY: Math.round(p.surfaceY),
          w: Math.round(p.w),
          gravity: p.gravity === 1 ? "floor" : "ceiling",
        })),
      obstaclesVisible: state.obstacles.length,
      dashObstaclesVisible: state.dashObstacles.length,
      dashPlatformsVisible: state.dashPlatforms.length,
      dashTrailsVisible: state.dashTrails.length,
      message: state.message,
    };
    return JSON.stringify(payload);
  }

  function onPointerDown(event) {
    event.preventDefault();
    canvas.focus();
    flap();
  }

  function onKeyDown(event) {
    const key = event.key.toLowerCase();
    const code = event.code.toLowerCase();
    if (["space", "arrowup", "keyw"].includes(code) || key === " ") event.preventDefault();
    keysDown.add(key);
    if (once.has(key)) return;
    once.add(key);

    if (key === " " || code === "space" || key === "arrowup" || key === "w") flap();
    if (key === "enter" && state.mode !== "playing") resetGame();
    if (key === "r") resetGame();
    if (key === "p") togglePause();
    if (key === "f") toggleFullscreen();
  }

  function onKeyUp(event) {
    const key = event.key.toLowerCase();
    keysDown.delete(key);
    once.delete(key);
  }

  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("contextmenu", (event) => event.preventDefault());
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  document.addEventListener("fullscreenchange", () => {
    document.body.classList.toggle("fullscreen", Boolean(document.fullscreenElement));
  });

  let lastTime = performance.now();
  let manualClock = false;

  function frame(now) {
    if (!manualClock) {
      const dt = Math.min(0.033, (now - lastTime) / 1000 || 0);
      update(dt);
      render();
    }
    lastTime = now;
    requestAnimationFrame(frame);
  }

  window.advanceTime = (ms) => {
    manualClock = true;
    const steps = Math.max(1, Math.round(ms / (1000 / 60)));
    for (let i = 0; i < steps; i += 1) update(1 / 60);
    render();
  };
  window.render_game_to_text = renderGameToText;

  state.clouds = makeClouds();
  render();
  requestAnimationFrame(frame);
})();
