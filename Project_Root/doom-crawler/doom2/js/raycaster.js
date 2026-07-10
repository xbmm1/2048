// js/raycaster.js
// DOOM-style raycasting renderer: one DDA ray per screen column for walls,
// plus billboarded sprites drawn against a per-column depth buffer so
// enemies/pickups are correctly hidden behind walls.

const Raycaster = (() => {
  const FOV = (60 * Math.PI) / 180;

  function render(ctx, W, H, tiles, tw, th, player, sprites) {
    const zbuffer = new Float32Array(W);
    const planeLen = Math.tan(FOV / 2);

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#15151d';
    ctx.fillRect(0, 0, W, H / 2);
    ctx.fillStyle = '#26241a';
    ctx.fillRect(0, H / 2, W, H / 2);

    for (let x = 0; x < W; x++) {
      const cameraX = (2 * x) / W - 1; // -1..1 across the screen
      const rayAngle = player.angle + Math.atan(cameraX * planeLen);
      const rayDirX = Math.cos(rayAngle);
      const rayDirY = Math.sin(rayAngle);

      let mapX = Math.floor(player.x);
      let mapY = Math.floor(player.y);

      const deltaDistX = rayDirX === 0 ? 1e30 : Math.abs(1 / rayDirX);
      const deltaDistY = rayDirY === 0 ? 1e30 : Math.abs(1 / rayDirY);

      let stepX, sideDistX, stepY, sideDistY;
      if (rayDirX < 0) {
        stepX = -1;
        sideDistX = (player.x - mapX) * deltaDistX;
      } else {
        stepX = 1;
        sideDistX = (mapX + 1 - player.x) * deltaDistX;
      }
      if (rayDirY < 0) {
        stepY = -1;
        sideDistY = (player.y - mapY) * deltaDistY;
      } else {
        stepY = 1;
        sideDistY = (mapY + 1 - player.y) * deltaDistY;
      }

      let hit = false, side = 0, safety = 0;
      while (!hit && safety++ < 128) {
        if (sideDistX < sideDistY) {
          sideDistX += deltaDistX;
          mapX += stepX;
          side = 0;
        } else {
          sideDistY += deltaDistY;
          mapY += stepY;
          side = 1;
        }
        if (mapX < 0 || mapY < 0 || mapX >= tw || mapY >= th) {
          hit = true;
          break;
        }
        if (tiles[mapY][mapX] === 1) hit = true;
      }

      // Perpendicular (not raw) distance -- keeps walls straight, no fisheye.
      const perpDist = side === 0 ? sideDistX - deltaDistX : sideDistY - deltaDistY;
      zbuffer[x] = perpDist;

      const lineHeight = Math.min(H * 4, H / Math.max(perpDist, 0.0001));
      const drawStart = Math.max(0, (H - lineHeight) / 2);
      const drawEnd = Math.min(H, (H + lineHeight) / 2);

      let shade = Math.max(0.12, 1 - perpDist / 16);
      if (side === 1) shade *= 0.68;
      const checker = ((mapX % 2) + (mapY % 2) + 2) % 2;
      const base = checker === 0 ? [150, 90, 60] : [126, 74, 48];
      ctx.fillStyle = `rgb(${(base[0] * shade) | 0},${(base[1] * shade) | 0},${(base[2] * shade) | 0})`;
      ctx.fillRect(x, drawStart, 1, drawEnd - drawStart);
    }

    drawSprites(ctx, W, H, player, sprites, zbuffer, planeLen);
    return zbuffer;
  }

  function drawSprites(ctx, W, H, player, sprites, zbuffer, planeLen) {
    const dirX = Math.cos(player.angle);
    const dirY = Math.sin(player.angle);
    const planeX = -dirY * planeLen;
    const planeY = dirX * planeLen;
    const invDet = 1.0 / (planeX * dirY - dirX * planeY);

    const ordered = sprites
      .map((s) => ({ s, d2: (s.x - player.x) ** 2 + (s.y - player.y) ** 2 }))
      .sort((a, b) => b.d2 - a.d2); // far -> near

    const time = performance.now() / 1000;

    for (const { s } of ordered) {
      const sx = s.x - player.x;
      const sy = s.y - player.y;
      const transformX = invDet * (dirY * sx - dirX * sy);
      const transformY = invDet * (-planeY * sx + planeX * sy);
      if (transformY <= 0.1) continue; // behind camera

      const screenX = (W / 2) * (1 + transformX / transformY);
      const spriteSize = Math.min(H * 5, H / transformY) * (s.scale || 1);
      const top = H / 2 - spriteSize / 2;
      const bottom = top + spriteSize;
      const left = screenX - spriteSize / 2;
      const right = screenX + spriteSize / 2;

      const x0 = Math.max(0, Math.floor(left));
      const x1 = Math.min(W, Math.floor(right));
      if (x0 >= x1) continue;

      const shade = Math.max(0.3, 1 - transformY / 16);
      const clampedTop = Math.max(0, top);
      const clampedBottom = Math.min(H, bottom);
      if (clampedBottom <= clampedTop) continue;

      if (s.ghost) {
        // Simple ghost silhouette: rounded head, straight body, wavy
        // trailing bottom edge, two dark eyes, and a gentle float bob.
        const bob = Math.sin(time * 2.2 + s.x * 3 + s.y * 3) * spriteSize * 0.03;
        const headRound = spriteSize * 0.16;
        const waveAmp = spriteSize * 0.07;
        const scallops = 4;
        const phase = s.x * 5 + s.y * 5;

        for (let x = x0; x < x1; x++) {
          if (transformY >= zbuffer[x]) continue; // wall is closer -> occluded

          const u = Math.min(1, Math.max(0, (x - left) / (right - left)));
          const colTop = top + bob + (1 - Math.sin(u * Math.PI)) * headRound;
          const colBottom = bottom + bob - waveAmp / 2 +
            waveAmp * Math.sin(u * scallops * Math.PI * 2 + phase);

          const cTop = Math.max(0, colTop);
          const cBottom = Math.min(H, colBottom);
          if (cBottom <= cTop) continue;

          const edge = Math.min(1, (Math.min(x - x0, x1 - x) + 1) / (spriteSize * 0.2 + 1));
          ctx.globalAlpha = shade * Math.max(0.5, edge) * 0.82;
          ctx.fillStyle = s.color || '#eaf3ff';
          ctx.fillRect(x, cTop, 1, cBottom - cTop);

          // Two small dark eyes near the top of the head.
          const eyeTop = colTop + spriteSize * 0.22;
          const eyeBottom = colTop + spriteSize * 0.34;
          const inEyeBand = (u > 0.26 && u < 0.42) || (u > 0.58 && u < 0.74);
          if (inEyeBand && eyeBottom > cTop) {
            ctx.globalAlpha = shade;
            ctx.fillStyle = '#1a2230';
            const eTop = Math.max(cTop, eyeTop);
            const eBottom = Math.min(cBottom, eyeBottom);
            if (eBottom > eTop) ctx.fillRect(x, eTop, 1, eBottom - eTop);
          }
        }
        ctx.globalAlpha = 1;
        continue;
      }

      ctx.globalAlpha = shade;
      for (let x = x0; x < x1; x++) {
        if (transformY >= zbuffer[x]) continue; // wall is closer -> occluded
        // Round the silhouette slightly: fade the outer columns.
        const edge = Math.min(1, (Math.min(x - x0, x1 - x) + 1) / (spriteSize * 0.25 + 1));
        ctx.globalAlpha = shade * Math.max(0.6, edge);
        ctx.fillStyle = s.color || '#e33333';
        ctx.fillRect(x, clampedTop, 1, clampedBottom - clampedTop);
      }
      ctx.globalAlpha = 1;
    }
  }

  return { render, FOV };
})();
