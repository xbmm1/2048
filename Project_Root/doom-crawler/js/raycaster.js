function renderScene(state, ctx, canvas) {
  if (!ctx || !canvas || !state) return [];

  const width = canvas.width;
  const height = canvas.height;
  const player = state.player;
  const tiles = state.tiles;
  const zBuffer = new Float32Array(width);

  ctx.clearRect(0, 0, width, height);
  ctx.imageSmoothingEnabled = false;

  const sky = ctx.createLinearGradient(0, 0, 0, height / 2);
  sky.addColorStop(0, '#0b1120');
  sky.addColorStop(1, '#1f3758');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, height / 2);

  const floor = ctx.createLinearGradient(0, height / 2, 0, height);
  floor.addColorStop(0, '#1b2333');
  floor.addColorStop(1, '#06080d');
  ctx.fillStyle = floor;
  ctx.fillRect(0, height / 2, width, height / 2);

  if (!player || !tiles || !tiles.length || !tiles[0].length) {
    return Array.from(zBuffer);
  }

  const mapWidth = tiles[0].length;
  const mapHeight = tiles.length;

  for (let x = 0; x < width; x++) {
    const cameraX = (2 * x) / width - 1;
    const rayDirX = player.dirX + player.planeX * cameraX;
    const rayDirY = player.dirY + player.planeY * cameraX;

    let mapX = Math.floor(player.x);
    let mapY = Math.floor(player.y);
    const deltaDistX = rayDirX === 0 ? 1e30 : Math.abs(1 / rayDirX);
    const deltaDistY = rayDirY === 0 ? 1e30 : Math.abs(1 / rayDirY);
    let stepX = rayDirX < 0 ? -1 : 1;
    let stepY = rayDirY < 0 ? -1 : 1;

    let sideDistX = rayDirX < 0 ? (player.x - mapX) * deltaDistX : (mapX + 1 - player.x) * deltaDistX;
    let sideDistY = rayDirY < 0 ? (player.y - mapY) * deltaDistY : (mapY + 1 - player.y) * deltaDistY;

    let hit = 0;
    let side = 0;
    while (!hit) {
      if (sideDistX < sideDistY) {
        sideDistX += deltaDistX;
        mapX += stepX;
        side = 0;
      } else {
        sideDistY += deltaDistY;
        mapY += stepY;
        side = 1;
      }

      if (mapX < 0 || mapY < 0 || mapX >= mapWidth || mapY >= mapHeight || tiles[mapY][mapX] === 1) {
        hit = 1;
      }
    }

    const perpDist = side === 0 ? sideDistX - deltaDistX : sideDistY - deltaDistY;
    zBuffer[x] = perpDist;

    const lineHeight = Math.min(height * 2, Math.floor(height / Math.max(perpDist, 0.001)));
    const drawStart = Math.max(0, Math.floor(-lineHeight / 2 + height / 2));
    const drawEnd = Math.min(height - 1, Math.floor(lineHeight / 2 + height / 2));
    const shade = Math.max(0.2, Math.min(1, 1 - perpDist / 16));
    const intensity = side === 1 ? shade * 0.72 : shade;
    const r = Math.floor(72 * intensity);
    const g = Math.floor(96 * intensity);
    const b = Math.floor(118 * intensity);

    ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
    ctx.fillRect(x, drawStart, 1, drawEnd - drawStart + 1);
  }

  const sprites = [];
  if (state.exit) sprites.push({ kind: 'exit', x: state.exit.x, y: state.exit.y, dist: 0 });
  for (const item of state.items || []) {
    if (item && !item.collected) sprites.push({ kind: item.kind, x: item.x, y: item.y, dist: 0 });
  }
  for (const enemy of state.enemies || []) {
    if (enemy && enemy.alive) sprites.push({ kind: 'enemy', x: enemy.x, y: enemy.y, dist: 0, hurt: enemy.hurt });
  }

  sprites.forEach((sprite) => {
    const dx = sprite.x - player.x;
    const dy = sprite.y - player.y;
    sprite.dist = dx * dx + dy * dy;
  });
  sprites.sort((a, b) => b.dist - a.dist);

  for (const sprite of sprites) {
    const dx = sprite.x - player.x;
    const dy = sprite.y - player.y;
    const invDet = 1 / (player.planeX * player.dirY - player.dirX * player.planeY);
    const transformX = invDet * (player.dirY * dx - player.dirX * dy);
    const transformY = invDet * (-player.planeY * dx + player.planeX * dy);

    if (transformY <= 0) continue;

    const screenX = Math.floor((width / 2) * (1 + transformX / transformY));
    const spriteHeight = Math.abs(Math.floor(height / transformY));
    const spriteWidth = Math.max(6, Math.floor(spriteHeight * 0.55));
    const drawStartY = Math.max(0, Math.floor(-spriteHeight / 2 + height / 2));
    const drawEndY = Math.min(height - 1, Math.floor(spriteHeight / 2 + height / 2));
    const drawStartX = Math.max(0, Math.floor(-spriteWidth / 2 + screenX));
    const drawEndX = Math.min(width - 1, Math.floor(spriteWidth / 2 + screenX));

    let color = '#8b5a2b';
    if (sprite.kind === 'enemy') {
      color = sprite.hurt ? '#ff5d5d' : '#c96a2f';
    } else if (sprite.kind === 'exit') {
      color = '#45f1ff';
    } else if (sprite.kind === 'health') {
      color = '#44ff9b';
    } else if (sprite.kind === 'key') {
      color = '#ffd76e';
    }

    ctx.fillStyle = color;
    for (let x = drawStartX; x <= drawEndX; x++) {
      if (x < 0 || x >= width) continue;
      if (transformY >= zBuffer[x]) continue;
      const yOffset = Math.max(0, Math.floor((x - drawStartX) / Math.max(1, drawEndX - drawStartX + 1) * (drawEndY - drawStartY + 1)));
      const sliceHeight = Math.max(2, Math.floor(spriteHeight * (0.6 + yOffset / (drawEndY - drawStartY + 1) * 0.2)));
      const yStart = drawStartY + Math.floor(yOffset * 0.2);
      ctx.fillRect(x, yStart, 1, sliceHeight);
    }
  }

  return Array.from(zBuffer);
}

window.Raycaster = { renderScene: renderScene };