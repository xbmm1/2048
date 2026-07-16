// js/raycaster.js
// DOOM-style raycasting renderer: one DDA ray per screen column for walls,
// plus billboarded sprites drawn against a per-column depth buffer so
// enemies/pickups are correctly hidden behind walls.

const Raycaster = (() => {
  const FOV = (60 * Math.PI) / 180;

  // Default palette used when no per-floor theme is supplied.
  const DEFAULT_THEME = {
    wallA: [150, 90, 60],
    wallB: [126, 74, 48],
    floorColor: '#26241a',
    ceilingFallback: '#15151d',
    skyTint: null,
  };

  function render(ctx, W, H, tiles, tw, th, player, sprites, sky, theme) {
    const t = theme || DEFAULT_THEME;
    const zbuffer = new Float32Array(W);
    const planeLen = Math.tan(FOV / 2);

    ctx.clearRect(0, 0, W, H);
    if (!sky || !drawSky(ctx, W, H, player, sky)) {
      ctx.fillStyle = t.ceilingFallback;
      ctx.fillRect(0, 0, W, H / 2);
    } else if (t.skyTint) {
      ctx.fillStyle = t.skyTint;
      ctx.fillRect(0, 0, W, H / 2);
    }
    ctx.fillStyle = t.floorColor;
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
      const base = checker === 0 ? t.wallA : t.wallB;
      ctx.fillStyle = `rgb(${(base[0] * shade) | 0},${(base[1] * shade) | 0},${(base[2] * shade) | 0})`;
      ctx.fillRect(x, drawStart, 1, drawEnd - drawStart);
    }

    drawSprites(ctx, W, H, player, sprites, zbuffer, planeLen);
    return zbuffer;
  }

  // Draws a 360-degree panorama across the ceiling band, scrolling it
  // horizontally to match the player's view angle so it reads as a
  // continuous background that wraps seamlessly at the edges. `sky` can be
  // an <img> or <canvas> whose width represents a full 2*PI turn. Returns
  // false (and draws nothing) if the source isn't ready yet.
  function drawSky(ctx, W, H, player, sky) {
    const srcW = sky.width || sky.naturalWidth;
    const srcH = sky.height || sky.naturalHeight;
    if (!srcW || !srcH) return false;

    const bandH = H / 2;
    const pxPerRad = srcW / (Math.PI * 2);
    const scale = (FOV * pxPerRad) / W; // source px per screen px
    let startX = (player.angle - FOV / 2) * pxPerRad;
    startX = ((startX % srcW) + srcW) % srcW;
    const sliceW = W * scale;

    if (startX + sliceW <= srcW) {
      ctx.drawImage(sky, startX, 0, sliceW, srcH, 0, 0, W, bandH);
    } else {
      const firstSrcW = srcW - startX;
      const firstDestW = firstSrcW / scale;
      ctx.drawImage(sky, startX, 0, firstSrcW, srcH, 0, 0, firstDestW, bandH);
      const remainSrcW = sliceW - firstSrcW;
      ctx.drawImage(sky, 0, 0, remainSrcW, srcH, firstDestW, 0, W - firstDestW, bandH);
    }
    return true;
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

      if (s.key) {
        // Simple key silhouette: a hollow ring (bow), a vertical spine,
        // and two teeth prongs jutting out to one side near the bottom.
        const centerX = screenX;
        const bowHeight = spriteSize * 0.46;
        const bowCenterY = top + bowHeight * 0.52;
        const bowRadiusX = spriteSize * 0.26;
        const bowRadiusY = bowHeight * 0.42;
        const ringThickness = Math.max(1, spriteSize * 0.09);
        const spineHalfWidth = Math.max(1, spriteSize * 0.05);
        const spineBottom = bottom - spriteSize * 0.02;
        const teethTop = bottom - spriteSize * 0.22;
        const teethWidth = spineHalfWidth * 2.4;
        const tooth1Bottom = teethTop + (spineBottom - teethTop) * 0.4;
        const tooth2Top = teethTop + (spineBottom - teethTop) * 0.6;

        for (let x = x0; x < x1; x++) {
          if (transformY >= zbuffer[x]) continue; // wall is closer -> occluded
          const dx = x + 0.5 - centerX;
          ctx.fillStyle = s.color || '#ffd23f';

          // Bow: draw only the top/bottom arcs of the ellipse (a ring).
          if (Math.abs(dx) <= bowRadiusX) {
            const hy = bowRadiusY * Math.sqrt(1 - (dx / bowRadiusX) ** 2);
            const arcTopStart = Math.max(0, bowCenterY - hy);
            const arcTopEnd = Math.min(H, bowCenterY - hy + ringThickness);
            if (arcTopEnd > arcTopStart) {
              ctx.globalAlpha = shade;
              ctx.fillRect(x, arcTopStart, 1, arcTopEnd - arcTopStart);
            }
            const arcBottomEnd = Math.min(H, bowCenterY + hy);
            const arcBottomStart = Math.max(0, arcBottomEnd - ringThickness);
            if (arcBottomEnd > arcBottomStart) {
              ctx.globalAlpha = shade;
              ctx.fillRect(x, arcBottomStart, 1, arcBottomEnd - arcBottomStart);
            }
          }

          // Spine: a thin vertical bar running from the bow down to the tip.
          if (Math.abs(dx) <= spineHalfWidth) {
            const spTop = Math.max(0, top + bowHeight);
            const spBottom = Math.min(H, spineBottom);
            if (spBottom > spTop) {
              ctx.globalAlpha = shade;
              ctx.fillRect(x, spTop, 1, spBottom - spTop);
            }
          }

          // Teeth: two short prongs sticking out to the right of the spine.
          if (dx > spineHalfWidth && dx <= spineHalfWidth + teethWidth) {
            const t0 = Math.max(0, teethTop);
            const t1 = Math.min(H, tooth1Bottom);
            if (t1 > t0) {
              ctx.globalAlpha = shade;
              ctx.fillRect(x, t0, 1, t1 - t0);
            }
            const t2 = Math.max(0, tooth2Top);
            const t3 = Math.min(H, spineBottom);
            if (t3 > t2) {
              ctx.globalAlpha = shade;
              ctx.fillRect(x, t2, 1, t3 - t2);
            }
          }
        }
        ctx.globalAlpha = 1;
        continue;
      }

      if (s.health) {
        // Simple health pack: a boxy case with a dark frame and a white
        // cross painted across the middle.
        const crossHalfW = spriteSize * 0.14;
        const crossTop = top + spriteSize * 0.36;
        const crossBottom = top + spriteSize * 0.64;

        for (let x = x0; x < x1; x++) {
          if (transformY >= zbuffer[x]) continue; // wall is closer -> occluded
          const u = (x - left) / (right - left);
          const isFrame = u < 0.08 || u > 0.92;
          const dx = x + 0.5 - screenX;

          if (isFrame) {
            ctx.globalAlpha = shade;
            ctx.fillStyle = '#1d3a24';
            ctx.fillRect(x, clampedTop, 1, clampedBottom - clampedTop);
            continue;
          }

          ctx.globalAlpha = shade;
          ctx.fillStyle = s.color || '#3fbf5f';
          ctx.fillRect(x, clampedTop, 1, clampedBottom - clampedTop);

          // Vertical bar of the cross.
          if (Math.abs(dx) <= crossHalfW) {
            const vTop = Math.max(clampedTop, top + spriteSize * 0.14);
            const vBottom = Math.min(clampedBottom, top + spriteSize * 0.86);
            if (vBottom > vTop) {
              ctx.globalAlpha = shade;
              ctx.fillStyle = '#f4f4f0';
              ctx.fillRect(x, vTop, 1, vBottom - vTop);
            }
          }
          // Horizontal bar of the cross.
          const hTop = Math.max(clampedTop, crossTop);
          const hBottom = Math.min(clampedBottom, crossBottom);
          if (hBottom > hTop && u > 0.14 && u < 0.86) {
            ctx.globalAlpha = shade;
            ctx.fillStyle = '#f4f4f0';
            ctx.fillRect(x, hTop, 1, hBottom - hTop);
          }
        }
        ctx.globalAlpha = 1;
        continue;
      }

      if (s.bolt) {
        // Ranged-enemy projectile: a small glowing orb with a soft halo.
        const coreR = spriteSize * 0.16;
        const haloR = spriteSize * 0.32;
        for (let x = x0; x < x1; x++) {
          if (transformY >= zbuffer[x]) continue; // wall is closer -> occluded
          const dx = x + 0.5 - screenX;
          if (Math.abs(dx) > haloR) continue;
          const haloHy = Math.sqrt(Math.max(0, haloR ** 2 - dx ** 2));
          const hTop = Math.max(0, H / 2 - haloHy);
          const hBottom = Math.min(H, H / 2 + haloHy);
          if (hBottom > hTop) {
            ctx.globalAlpha = shade * 0.35;
            ctx.fillStyle = s.color || '#ff5fd6';
            ctx.fillRect(x, hTop, 1, hBottom - hTop);
          }
          if (Math.abs(dx) <= coreR) {
            const coreHy = Math.sqrt(Math.max(0, coreR ** 2 - dx ** 2));
            const cT = Math.max(0, H / 2 - coreHy);
            const cB = Math.min(H, H / 2 + coreHy);
            if (cB > cT) {
              ctx.globalAlpha = shade;
              ctx.fillStyle = '#fff0fb';
              ctx.fillRect(x, cT, 1, cB - cT);
            }
          }
        }
        ctx.globalAlpha = 1;
        continue;
      }

      if (s.door) {
        // Simple paneled door: dark frame border, a glowing panel with a
        // horizontal mid-rail, and a small knob near one edge.
        const glow = 0.82 + 0.18 * Math.sin(time * 1.6 + s.x + s.y);
        const railTop = top + spriteSize * 0.47;
        const railBottom = top + spriteSize * 0.53;
        const knobTop = top + spriteSize * 0.56;
        const knobBottom = top + spriteSize * 0.63;

        for (let x = x0; x < x1; x++) {
          if (transformY >= zbuffer[x]) continue; // wall is closer -> occluded
          const u = (x - left) / (right - left);
          const isFrame = u < 0.07 || u > 0.93;

          if (isFrame) {
            ctx.globalAlpha = shade;
            ctx.fillStyle = '#12262e';
            ctx.fillRect(x, clampedTop, 1, clampedBottom - clampedTop);
            continue;
          }

          ctx.globalAlpha = shade * glow;
          ctx.fillStyle = s.color || '#39c8ff';
          ctx.fillRect(x, clampedTop, 1, clampedBottom - clampedTop);

          const rTop = Math.max(clampedTop, railTop);
          const rBottom = Math.min(clampedBottom, railBottom);
          if (rBottom > rTop) {
            ctx.globalAlpha = shade;
            ctx.fillStyle = '#12262e';
            ctx.fillRect(x, rTop, 1, rBottom - rTop);
          }

          if (u > 0.72 && u < 0.83) {
            const kTop = Math.max(clampedTop, knobTop);
            const kBottom = Math.min(clampedBottom, knobBottom);
            if (kBottom > kTop) {
              ctx.globalAlpha = shade;
              ctx.fillStyle = '#ffe27a';
              ctx.fillRect(x, kTop, 1, kBottom - kTop);
            }
          }
        }
        ctx.globalAlpha = 1;
        continue;
      }

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
