(() => {
  "use strict";

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");

  const W = 960;
  const H = 540;
  const GROUND_H = 76;
  const PLAY_H = H - GROUND_H;
  const TITLE = "Chicken Flap - For My Sexy Girlfriend Ella";
  const TWO_PI = Math.PI * 2;

  const keysDown = new Set();
  const once = new Set();

  const state = {
    mode: "title",
    time: 0,
    score: 0,
    best: readBestScore(),
    seed: 17,
    speed: 185,
    spawnTimer: 0,
    shake: 0,
    message: "",
    player: makePlayer(),
    obstacles: [],
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
    state.mode = "playing";
    state.time = 0;
    state.score = 0;
    state.seed = 17;
    state.speed = 185;
    state.spawnTimer = 0.45;
    state.shake = 0;
    state.message = "";
    state.player = makePlayer();
    state.obstacles.length = 0;
    state.feathers.length = 0;
    state.hearts.length = 0;
    state.clouds = makeClouds();
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

  function flap() {
    if (state.mode === "title") {
      resetGame();
      applyFlap();
      return;
    }
    if (state.mode === "gameover") {
      resetGame();
      applyFlap();
      return;
    }
    if (state.mode !== "playing") return;
    applyFlap();
  }

  function applyFlap() {
    state.player.vy = -320;
    state.player.flapPulse = 0.2;
    addFeathers(state.player.x - 12, state.player.y + 10, 7, 100);
    addHeart(state.player.x - 26, state.player.y - 18);
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
      updateClouds(dt, 26);
      updateFeathers(dt);
      return;
    }

    if (state.mode === "paused") {
      updateFeathers(dt);
      return;
    }

    if (state.mode === "gameover") {
      state.time += dt;
      state.shake = Math.max(0, state.shake - dt);
      updateClouds(dt, 26);
      updateFeathers(dt);
      return;
    }

    state.time += dt;
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
        }
      }
    }
  }

  function circleRect(cx, cy, r, rect) {
    const x = clamp(cx, rect.x, rect.x + rect.w);
    const y = clamp(cy, rect.y, rect.y + rect.h);
    return Math.hypot(cx - x, cy - y) <= r;
  }

  function crash(message) {
    if (state.mode !== "playing") return;
    state.mode = "gameover";
    state.message = message;
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
    drawClouds();
    drawObstacles();
    drawGround();
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
      ctx.fillStyle = "rgba(255, 247, 223, 0.72)";
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
    const bob = Math.sin(state.time * 9) * 1.4;
    ctx.save();
    ctx.translate(p.x, p.y + bob);
    ctx.rotate(p.angle);

    ctx.fillStyle = "rgba(39, 49, 57, 0.22)";
    ctx.beginPath();
    ctx.ellipse(-4, p.r + 14, p.r * 0.92, 7, 0, 0, TWO_PI);
    ctx.fill();

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
    ctx.fillText("Space / click to flap   P pause   R restart", W - 26, 43);
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
    ctx.fillText("Flap through the mushroom gaps. One button, quick restarts.", W / 2, 245);
    drawButton(W / 2 - 120, 292, 240, 58, "Start Flapping");
    ctx.fillStyle = "rgba(255, 244, 214, 0.82)";
    ctx.font = "700 16px Inter, system-ui, sans-serif";
    ctx.fillText("Space, click, or tap to flap", W / 2, 392);
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
    drawButton(W / 2 - 104, 326, 208, 54, "Try Again");
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
    const nextObstacle = state.obstacles.find((o) => o.x + o.w >= state.player.x - state.player.r);
    const payload = {
      title: TITLE,
      coordinateSystem: "origin top-left, x right, y down, units canvas pixels, size 960x540",
      mode: state.mode,
      objective: "tap to flap through mushroom gaps; score by passing each gap",
      score: state.score,
      best: state.best,
      difficulty: { level: difficultyLevel(), label: difficultyLabel() },
      speed: Math.round(state.speed),
      gapForgiveness: Number(gapForgiveness().toFixed(1)),
      obstacleSpacing: Math.round(obstacleSpacing()),
      player: {
        x: Math.round(state.player.x),
        y: Math.round(state.player.y),
        vy: Math.round(state.player.vy),
        r: state.player.r,
      },
      nextObstacle: nextObstacle
        ? {
            x: Math.round(nextObstacle.x),
            w: nextObstacle.w,
            gapY: Math.round(nextObstacle.gapY),
            gapH: Math.round(nextObstacle.gapH),
            passed: nextObstacle.passed,
            bonus: nextObstacle.bonus && !nextObstacle.bonus.collected,
          }
        : null,
      obstaclesVisible: state.obstacles.length,
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
