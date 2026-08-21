export class DensityTracker {
  constructor(venue, cellSize = 4) {
    this.venue = venue;
    this.cellSize = cellSize;
    this.cols = Math.ceil(venue.bounds.width / cellSize);
    this.rows = Math.ceil(venue.bounds.height / cellSize);
    this.counts = new Uint16Array(this.cols * this.rows);
    this.peakDensity = 0;
    this.peakCell = null;
  }

  key(c, r) { return r * this.cols + c; }

  update(agents) {
    this.counts.fill(0);
    for (const a of agents) {
      if (a.done) continue;
      const c = Math.max(0, Math.min(this.cols - 1, Math.floor(a.x / this.cellSize)));
      const r = Math.max(0, Math.min(this.rows - 1, Math.floor(a.y / this.cellSize)));
      this.counts[this.key(c, r)]++;
    }
    let currentPeak = 0, currentCell = null;
    for (let r = 0; r < this.rows; r++) for (let c = 0; c < this.cols; c++) {
      const density = this.density(c, r);
      if (density > currentPeak) { currentPeak = density; currentCell = { c, r, density }; }
    }
    if (currentPeak > this.peakDensity) { this.peakDensity = currentPeak; this.peakCell = currentCell; }
    return { currentPeak, currentCell };
  }

  density(c, r) { return this.counts[this.key(c, r)] / (this.cellSize * this.cellSize); }

  severity(density) {
    if (density >= 3.5) return 'critical';
    if (density >= 2.0) return 'high';
    if (density >= 1.0) return 'busy';
    return 'normal';
  }

  cells() {
    const out=[];
    for(let r=0;r<this.rows;r++) for(let c=0;c<this.cols;c++) {
      const density=this.density(c,r);
      if(density>=.25) out.push({c,r,density,severity:this.severity(density),x:c*this.cellSize,y:r*this.cellSize,w:this.cellSize,h:this.cellSize});
    }
    return out;
  }
}
