// js/maze.js
// Wilson's algorithm: generates a Uniform Spanning Tree over a grid of cells
// via loop-erased random walks, then expands it into a wall/floor tile grid.

const Maze = (() => {
  function cellKey(x, y) {
    return x + ',' + y;
  }

  function neighborsOf(x, y, cols, rows) {
    const n = [];
    if (x > 0) n.push([x - 1, y]);
    if (x < cols - 1) n.push([x + 1, y]);
    if (y > 0) n.push([x, y - 1]);
    if (y < rows - 1) n.push([x, y + 1]);
    return n;
  }

  // Returns { cols, rows, connections } where connections maps a cellKey to
  // a Set of cellKeys it is directly connected to (an edge in the tree).
  function generate(cols, rows) {
    const inMaze = new Set();
    const connections = new Map();

    function connect(x1, y1, x2, y2) {
      const k1 = cellKey(x1, y1);
      const k2 = cellKey(x2, y2);
      if (!connections.has(k1)) connections.set(k1, new Set());
      if (!connections.has(k2)) connections.set(k2, new Set());
      connections.get(k1).add(k2);
      connections.get(k2).add(k1);
    }

    // Seed the maze with one random cell.
    const startX = Math.floor(Math.random() * cols);
    const startY = Math.floor(Math.random() * rows);
    inMaze.add(cellKey(startX, startY));

    const allCells = [];
    for (let x = 0; x < cols; x++) {
      for (let y = 0; y < rows; y++) allCells.push([x, y]);
    }
    // Visit cells in random order so the walk lengths stay small on average.
    for (let i = allCells.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [allCells[i], allCells[j]] = [allCells[j], allCells[i]];
    }

    for (const [sx, sy] of allCells) {
      if (inMaze.has(cellKey(sx, sy))) continue;

      // Loop-erased random walk: keep overwriting each cell's chosen
      // direction. Overwriting automatically erases any loop, because only
      // the most recent exit direction from a cell is ever kept.
      const path = new Map(); // cellKey -> [nx, ny]
      let cx = sx, cy = sy;
      let guard = 0;
      while (!inMaze.has(cellKey(cx, cy)) && guard++ < 100000) {
        const nbrs = neighborsOf(cx, cy, cols, rows);
        const [nx, ny] = nbrs[Math.floor(Math.random() * nbrs.length)];
        path.set(cellKey(cx, cy), [nx, ny]); // overwrite == loop erasure
        cx = nx;
        cy = ny;
      }

      // Carve the (now loop-free) path into the maze.
      let px = sx, py = sy;
      while (!inMaze.has(cellKey(px, py))) {
        const k = cellKey(px, py);
        const [nx, ny] = path.get(k);
        connect(px, py, nx, ny);
        inMaze.add(k);
        px = nx;
        py = ny;
      }
    }

    return { cols, rows, connections };
  }

  // Expands the cell graph into a (cols*2+1) x (rows*2+1) tile grid.
  // 1 = wall, 0 = floor. Odd coordinates are always cell centres.
  function toTiles(maze) {
    const { cols, rows, connections } = maze;
    const tw = cols * 2 + 1;
    const th = rows * 2 + 1;
    const tiles = [];
    for (let y = 0; y < th; y++) tiles.push(new Array(tw).fill(1));

    for (let x = 0; x < cols; x++) {
      for (let y = 0; y < rows; y++) {
        tiles[y * 2 + 1][x * 2 + 1] = 0;
        const conns = connections.get(cellKey(x, y));
        if (!conns) continue;
        for (const otherKey of conns) {
          const [ox, oy] = otherKey.split(',').map(Number);
          const tx = x * 2 + 1 + (ox - x);
          const ty = y * 2 + 1 + (oy - y);
          tiles[ty][tx] = 0;
        }
      }
    }

    return { tiles, w: tw, h: th };
  }

  return { generate, toTiles };
})();
