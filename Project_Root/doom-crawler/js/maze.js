function key(x, y) {
  return x + ',' + y;
}

function connectCells(cells, a, b) {
  var dx = b.x - a.x;
  var dy = b.y - a.y;
  if (dx === 1) {
    cells[a.y][a.x].neighbors[1] = true;
    cells[b.y][b.x].neighbors[3] = true;
  } else if (dx === -1) {
    cells[a.y][a.x].neighbors[3] = true;
    cells[b.y][b.x].neighbors[1] = true;
  } else if (dy === 1) {
    cells[a.y][a.x].neighbors[2] = true;
    cells[b.y][b.x].neighbors[0] = true;
  } else if (dy === -1) {
    cells[a.y][a.x].neighbors[0] = true;
    cells[b.y][b.x].neighbors[2] = true;
  }
}

function generateMaze(cols, rows) {
  var width = Math.max(4, Math.floor(cols || 8));
  var height = Math.max(4, Math.floor(rows || 8));
  var cells = Array.from({ length: height }, function () {
    return Array.from({ length: width }, function () {
      return { visited: false, neighbors: [false, false, false, false] };
    });
  });

  var startX = Math.floor(Math.random() * width);
  var startY = Math.floor(Math.random() * height);
  cells[startY][startX].visited = true;

  var unvisited = new Set();
  for (var y = 0; y < height; y++) {
    for (var x = 0; x < width; x++) {
      if (!(x === startX && y === startY)) {
        unvisited.add(key(x, y));
      }
    }
  }

  while (unvisited.size) {
    var seed = Array.from(unvisited)[Math.floor(Math.random() * unvisited.size)];
    var parts = seed.split(',');
    var sx = Number(parts[0]);
    var sy = Number(parts[1]);
    var x = sx;
    var y = sy;
    var path = [];
    var pathIndex = new Map();

    while (!cells[y][x].visited) {
      var currentKey = key(x, y);
      var previousIndex = pathIndex.get(currentKey);
      if (previousIndex === undefined) {
        pathIndex.set(currentKey, path.length);
        path.push({ x: x, y: y });
      } else {
        path.splice(previousIndex);
        var newIndex = new Map();
        for (var i = 0; i < path.length; i++) {
          newIndex.set(key(path[i].x, path[i].y), i);
        }
        pathIndex.clear();
        for (var entry of newIndex.entries()) {
          pathIndex.set(entry[0], entry[1]);
        }
      }

      var neighbors = [];
      if (x > 0) neighbors.push({ x: x - 1, y: y });
      if (x + 1 < width) neighbors.push({ x: x + 1, y: y });
      if (y > 0) neighbors.push({ x: x, y: y - 1 });
      if (y + 1 < height) neighbors.push({ x: x, y: y + 1 });

      var next = neighbors[Math.floor(Math.random() * neighbors.length)];
      x = next.x;
      y = next.y;
    }

    if (path.length) {
      var prev = null;
      path.forEach(function (cell) {
        cells[cell.y][cell.x].visited = true;
        unvisited.delete(key(cell.x, cell.y));
        if (prev) {
          connectCells(cells, prev, cell);
        }
        prev = cell;
      });

      connectCells(cells, prev, { x: x, y: y });
    } else {
      cells[y][x].visited = true;
      unvisited.delete(key(x, y));
    }
  }

  return { cols: width, rows: height, cells: cells, tiles: toTiles(cells) };
}

function toTiles(cells) {
  if (!cells || !cells.length || !cells[0].length) return [];
  var tileRows = cells.length * 2 + 1;
  var tileCols = cells[0].length * 2 + 1;
  var tiles = Array.from({ length: tileRows }, function () { return Array(tileCols).fill(1); });

  for (var y = 0; y < cells.length; y++) {
    for (var x = 0; x < cells[0].length; x++) {
      tiles[y * 2 + 1][x * 2 + 1] = 0;
      if (cells[y][x].neighbors[0]) tiles[y * 2][x * 2 + 1] = 0;
      if (cells[y][x].neighbors[1]) tiles[y * 2 + 1][x * 2 + 2] = 0;
      if (cells[y][x].neighbors[2]) tiles[y * 2 + 2][x * 2 + 1] = 0;
      if (cells[y][x].neighbors[3]) tiles[y * 2 + 1][x * 2] = 0;
    }
  }

  return tiles;
}

function findFarthestTile(tiles, startX, startY) {
  if (!tiles || !tiles.length || !tiles[0].length) {
    return { x: Math.floor(startX || 0), y: Math.floor(startY || 0) };
  }

  var sx = Math.floor(startX || 0);
  var sy = Math.floor(startY || 0);
  if (!Number.isFinite(sx) || !Number.isFinite(sy)) {
    return { x: 0, y: 0 };
  }

  var queue = [{ x: sx, y: sy, dist: 0 }];
  var visited = new Set([key(sx, sy)]);
  var farthest = { x: sx, y: sy, dist: 0 };

  while (queue.length) {
    var current = queue.shift();
    if (current.dist > farthest.dist) {
      farthest = current;
    }

    var directions = [
      { x: 1, y: 0 },
      { x: -1, y: 0 },
      { x: 0, y: 1 },
      { x: 0, y: -1 }
    ];

    for (var i = 0; i < directions.length; i += 1) {
      var dir = directions[i];
      var nx = current.x + dir.x;
      var ny = current.y + dir.y;
      var nextTile = tiles[ny] && tiles[ny][nx];
      if (nextTile === undefined || nextTile !== 0 || visited.has(key(nx, ny))) continue;
      visited.add(key(nx, ny));
      queue.push({ x: nx, y: ny, dist: current.dist + 1 });
    }
  }

  return { x: farthest.x, y: farthest.y };
}

window.Maze = {
  generateMaze: generateMaze,
  toTiles: toTiles,
  findFarthestTile: findFarthestTile
};