function key(x, y) {
  return x + ',' + y;
}

function isWalkable(tiles, x, y) {
  if (!tiles || !tiles.length || !tiles[0].length) return false;
  if (x < 0 || y < 0 || y >= tiles.length || x >= tiles[0].length) return false;
  return tiles[y][x] === 0;
}

function heuristic(x, y, goalX, goalY) {
  return Math.abs(x - goalX) + Math.abs(y - goalY);
}

function MinHeap() {
  this.data = [];
}

MinHeap.prototype.push = function (value) {
  this.data.push(value);
  this.bubbleUp(this.data.length - 1);
};

MinHeap.prototype.pop = function () {
  var first = this.data[0];
  var last = this.data.pop();
  if (this.data.length > 0) {
    this.data[0] = last;
    this.sinkDown(0);
  }
  return first;
};

MinHeap.prototype.size = function () {
  return this.data.length;
};

MinHeap.prototype.bubbleUp = function (index) {
  var item = this.data[index];
  while (index > 0) {
    var parentIndex = Math.floor((index - 1) / 2);
    var parentItem = this.data[parentIndex];
    if (item.f >= parentItem.f) break;
    this.data[parentIndex] = item;
    this.data[index] = parentItem;
    index = parentIndex;
  }
};

MinHeap.prototype.sinkDown = function (index) {
  var length = this.data.length;
  var item = this.data[index];
  while (true) {
    var leftIndex = index * 2 + 1;
    var rightIndex = leftIndex + 1;
    var smallest = index;

    if (leftIndex < length && this.data[leftIndex].f < this.data[smallest].f) {
      smallest = leftIndex;
    }
    if (rightIndex < length && this.data[rightIndex].f < this.data[smallest].f) {
      smallest = rightIndex;
    }
    if (smallest === index) break;
    this.data[index] = this.data[smallest];
    this.data[smallest] = item;
    index = smallest;
  }
};

function reconstructPath(cameFrom, goal) {
  var path = [];
  var current = goal;
  while (current) {
    path.push({ x: current.x, y: current.y });
    var parent = cameFrom.get(key(current.x, current.y));
    current = parent ? { x: parent.x, y: parent.y } : null;
  }
  return path.reverse();
}

function find(tiles, startX, startY, goalX, goalY) {
  if (!tiles || !tiles.length || !tiles[0].length) return null;

  var startTileX = Math.floor(startX);
  var startTileY = Math.floor(startY);
  var goalTileX = Math.floor(goalX);
  var goalTileY = Math.floor(goalY);

  if (!isWalkable(tiles, startTileX, startTileY) || !isWalkable(tiles, goalTileX, goalTileY)) {
    return null;
  }
  if (startTileX === goalTileX && startTileY === goalTileY) {
    return [{ x: startTileX, y: startTileY }];
  }

  var openSet = new MinHeap();
  var cameFrom = new Map();
  var gScore = new Map();
  var closed = new Set();

  openSet.push({ x: startTileX, y: startTileY, g: 0, f: heuristic(startTileX, startTileY, goalTileX, goalTileY) });
  gScore.set(key(startTileX, startTileY), 0);

  while (openSet.size()) {
    var current = openSet.pop();
    var currentKey = key(current.x, current.y);
    if (closed.has(currentKey)) continue;
    if (current.x === goalTileX && current.y === goalTileY) {
      return reconstructPath(cameFrom, current);
    }
    closed.add(currentKey);

    var directions = [
      { x: 1, y: 0 },
      { x: -1, y: 0 },
      { x: 0, y: 1 },
      { x: 0, y: -1 }
    ];

    for (var i = 0; i < directions.length; i += 1) {
      var dir = directions[i];
      var nextX = current.x + dir.x;
      var nextY = current.y + dir.y;
      if (!isWalkable(tiles, nextX, nextY)) continue;
      var nextKey = key(nextX, nextY);
      if (closed.has(nextKey)) continue;

      var tentativeG = current.g + 1;
      var previousG = gScore.get(nextKey);
      if (previousG === undefined || tentativeG < previousG) {
        cameFrom.set(nextKey, { x: current.x, y: current.y });
        gScore.set(nextKey, tentativeG);
        openSet.push({
          x: nextX,
          y: nextY,
          g: tentativeG,
          f: tentativeG + heuristic(nextX, nextY, goalTileX, goalTileY)
        });
      }
    }
  }

  return null;
}

window.AStar = { find: find };