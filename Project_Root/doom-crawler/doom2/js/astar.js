// js/astar.js
// A* over a 4-directional tile grid (0 = floor, 1 = wall), using Manhattan
// distance as the heuristic and a binary min-heap for the open set so the
// "pull lowest f" hot path stays O(log n) instead of an O(n) array scan.

const AStar = (() => {
  class MinHeap {
    constructor() {
      this.items = [];
    }
    size() {
      return this.items.length;
    }
    push(item) {
      const items = this.items;
      items.push(item);
      let i = items.length - 1;
      while (i > 0) {
        const parent = (i - 1) >> 1;
        if (items[parent].f <= items[i].f) break;
        [items[parent], items[i]] = [items[i], items[parent]];
        i = parent;
      }
    }
    pop() {
      const items = this.items;
      const top = items[0];
      const last = items.pop();
      if (items.length > 0) {
        items[0] = last;
        let i = 0;
        while (true) {
          const l = 2 * i + 1, r = 2 * i + 2;
          let smallest = i;
          if (l < items.length && items[l].f < items[smallest].f) smallest = l;
          if (r < items.length && items[r].f < items[smallest].f) smallest = r;
          if (smallest === i) break;
          [items[smallest], items[i]] = [items[i], items[smallest]];
          i = smallest;
        }
      }
      return top;
    }
  }

  function heuristic(x, y, gx, gy) {
    return Math.abs(gx - x) + Math.abs(gy - y);
  }

  // Returns an array of {x,y} tile coords from start to goal (inclusive),
  // or null if unreachable.
  function find(tiles, sx, sy, gx, gy) {
    const h = tiles.length;
    const w = tiles[0].length;
    if (sx < 0 || sy < 0 || sx >= w || sy >= h) return null;
    if (gx < 0 || gy < 0 || gx >= w || gy >= h) return null;
    if (tiles[sy][sx] === 1 || tiles[gy][gx] === 1) return null;

    const key = (x, y) => y * w + x;
    const open = new MinHeap();
    const gScore = new Map();
    const came = new Map();
    const closed = new Set();

    gScore.set(key(sx, sy), 0);
    open.push({ x: sx, y: sy, f: heuristic(sx, sy, gx, gy) });

    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];

    while (open.size() > 0) {
      const cur = open.pop();
      const ck = key(cur.x, cur.y);
      if (closed.has(ck)) continue;
      closed.add(ck);

      if (cur.x === gx && cur.y === gy) {
        const path = [{ x: cur.x, y: cur.y }];
        let k = ck;
        while (came.has(k)) {
          const [px, py] = came.get(k);
          path.push({ x: px, y: py });
          k = key(px, py);
        }
        path.reverse();
        return path;
      }

      for (const [dx, dy] of dirs) {
        const nx = cur.x + dx, ny = cur.y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        if (tiles[ny][nx] === 1) continue;
        const nk = key(nx, ny);
        const tentative = gScore.get(ck) + 1;
        if (!gScore.has(nk) || tentative < gScore.get(nk)) {
          gScore.set(nk, tentative);
          came.set(nk, [cur.x, cur.y]);
          open.push({ x: nx, y: ny, f: tentative + heuristic(nx, ny, gx, gy) });
        }
      }
    }

    return null;
  }

  return { find, MinHeap };
})();
