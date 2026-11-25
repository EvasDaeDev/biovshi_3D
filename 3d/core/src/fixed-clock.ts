/** Lab 04.1 timing policy; independent of RAF and DOM. */
export const FIXED_DT = 1 / 60;
export class FixedClock {
  private debt = 0;
  /** Fraction from the previous completed simulation tick to the current one. */
  get alpha():number { return Math.min(1,Math.max(0,this.debt/FIXED_DT)); }
  reset(): void { this.debt = 0; }
  advance(elapsed: number, step: (dt: number) => void, paused = false): number {
    if (!Number.isFinite(elapsed) || elapsed < 0) throw new RangeError('Invalid elapsed time');
    if (paused) return 0;
    this.debt = Math.min(.15, this.debt + Math.min(elapsed, .08));
    let n = 0;
    while (this.debt + 1e-12 >= FIXED_DT && n < 6) {
      step(FIXED_DT);
      this.debt = Math.max(0, this.debt - FIXED_DT);
      n++;
    }
    return n;
  }
}
