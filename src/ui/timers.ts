// Tracks timeouts/intervals so a screen or modal can cancel everything it scheduled when it closes.

export class Timers {
  private readonly timeouts = new Set<ReturnType<typeof setTimeout>>();
  private readonly intervals = new Set<ReturnType<typeof setInterval>>();

  after(ms: number, fn: () => void): void {
    const id = setTimeout(() => {
      this.timeouts.delete(id);
      fn();
    }, Math.max(0, ms));
    this.timeouts.add(id);
  }

  every(ms: number, fn: () => void): void {
    this.intervals.add(setInterval(fn, ms));
  }

  clear(): void {
    this.timeouts.forEach((id) => clearTimeout(id));
    this.intervals.forEach((id) => clearInterval(id));
    this.timeouts.clear();
    this.intervals.clear();
  }
}
