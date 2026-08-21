export class NavigationGrid {
  constructor(venue, cellSize = 1) {
    this.venue = venue;
    this.cellSize = cellSize;
    this.cols = Math.ceil(venue.bounds.width / cellSize);
    this.rows = Math.ceil(venue.bounds.height / cellSize);
    this.blocked = new Uint8Array(this.cols * this.rows);
    this.build();
  }

  key(c, r) { return r * this.cols + c; }
  valid(c, r) { return c >= 0 && r >= 0 && c < this.cols && r < this.rows; }
  toCell(p) { return { c: Math.max(0, Math.min(this.cols - 1, Math.floor(p.x / this.cellSize))), r: Math.max(0, Math.min(this.rows - 1, Math.floor(p.y / this.cellSize))) }; }
  toWorld(c, r) { return { x: (c + .5) * this.cellSize, y: (r + .5) * this.cellSize }; }
  isBlocked(c, r) { return !this.valid(c, r) || this.blocked[this.key(c, r)] === 1; }

  build() {
    const nonWalkableTypes = new Set(['blocked', 'seating']);
    for (const z of this.venue.zones.filter(z => nonWalkableTypes.has(z.type))) {
      const minC = Math.floor(z.x / this.cellSize), maxC = Math.ceil((z.x + z.w) / this.cellSize);
      const minR = Math.floor(z.y / this.cellSize), maxR = Math.ceil((z.y + z.h) / this.cellSize);
      for (let r = minR; r < maxR; r++) for (let c = minC; c < maxC; c++) if (this.valid(c, r)) this.blocked[this.key(c, r)] = 1;
    }
  }

  nearestWalkable(cell) {
    if (!this.isBlocked(cell.c, cell.r)) return cell;
    for (let radius = 1; radius < 10; radius++) {
      for (let dr = -radius; dr <= radius; dr++) for (let dc = -radius; dc <= radius; dc++) {
        const c = cell.c + dc, r = cell.r + dr;
        if (this.valid(c, r) && !this.isBlocked(c, r)) return { c, r };
      }
    }
    return cell;
  }

  findPath(from, to) {
    const start = this.nearestWalkable(this.toCell(from));
    const goal = this.nearestWalkable(this.toCell(to));
    const startKey = this.key(start.c, start.r), goalKey = this.key(goal.c, goal.r);
    const open = [{ ...start, f: 0 }], came = new Map(), g = new Map([[startKey, 0]]), closed = new Set();
    const dirs = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
    const h = (c,r) => Math.hypot(goal.c-c, goal.r-r);

    while (open.length) {
      open.sort((a,b) => a.f-b.f);
      const cur = open.shift(), ck = this.key(cur.c,cur.r);
      if (closed.has(ck)) continue;
      if (ck === goalKey) {
        const cells = [{c:cur.c,r:cur.r}]; let k=ck;
        while (came.has(k)) { const prev=came.get(k); cells.push(prev); k=this.key(prev.c,prev.r); }
        return cells.reverse().map(p => this.toWorld(p.c,p.r));
      }
      closed.add(ck);
      for (const [dc,dr] of dirs) {
        const c=cur.c+dc,r=cur.r+dr; if(this.isBlocked(c,r)) continue;
        if(dc && dr && (this.isBlocked(cur.c+dc,cur.r)||this.isBlocked(cur.c,cur.r+dr))) continue;
        const nk=this.key(c,r), tentative=(g.get(ck)??Infinity)+Math.hypot(dc,dr);
        if(tentative < (g.get(nk)??Infinity)) { came.set(nk,{c:cur.c,r:cur.r}); g.set(nk,tentative); open.push({c,r,f:tentative+h(c,r)}); }
      }
    }
    return [to];
  }
}
