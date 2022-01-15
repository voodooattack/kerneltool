// Port of https://www.npmjs.com/package/transfer-stats to TypeScript.

export interface TransferStats {
  started: boolean;
  paused: boolean;
  finished: boolean;
  bytesTotal?: number;
  bytesCompleted: number;
  startDateTime?: number;
  endDateTime?: number;
  percentage?: number;
  bytesRemaining?: number;
  msElapsed: number;
  bytesPerSecond: number;
  bytesPerSecondSharp: number;
  msTotal?: number;
  msRemaining?: number;
}

export class Transfer {
  bpsLog: Uint32Array;
  bytesTotal?: number;
  lastBytesCompleted: number;
  bytesCompleted: number;
  started: boolean;
  paused: boolean;
  finished: boolean;
  startDateTime?: number;
  updatedDateTime?: number;
  lastUpdatedDateTime?: number;
  pausedStartDateTime?: number;
  pausedTotalTime: number;
  endDateTime?: number;
  stats: TransferStats;

  constructor(options?: { bytesTotal?: number; bytesCompleted?: number }) {
    this.bpsLog = new Uint32Array(5);
    this.bytesTotal = options?.bytesTotal;
    this.bytesCompleted = options?.bytesCompleted ?? 0;
    this.lastBytesCompleted = this.bytesCompleted;
    this.startDateTime = undefined;
    this.pausedTotalTime = 0;
    this.started = false;
    this.finished = false;
    this.paused = false;
    const self = this;
    this.stats = {
      get started(): boolean {
        return self.started;
      },
      get paused(): boolean {
        return self.paused;
      },
      get finished(): boolean {
        return self.finished;
      },
      get bytesTotal(): number | undefined {
        return self.bytesTotal;
      },
      get bytesCompleted(): number {
        return self.bytesCompleted;
      },
      get startDateTime(): number | undefined {
        return self.startDateTime;
      },
      get endDateTime(): number | undefined {
        return self.endDateTime;
      },
      get percentage(): number | undefined {
        const { bytesRemaining, bytesTotal } = this;
        if (typeof bytesRemaining !== "number" || typeof bytesTotal !== "number") return;
        return parseFloat((1 - bytesRemaining / bytesTotal).toFixed(10));
      },

      get bytesRemaining(): number | undefined {
        const { bytesTotal, bytesCompleted } = this;
        if (typeof bytesTotal !== "number") return;
        return bytesTotal - bytesCompleted;
      },

      get msElapsed(): number {
        const { startDateTime } = this;
        if (!startDateTime) return 0;
        const currentDateTime: number = new Date().getTime();
        return currentDateTime - self.pausedTotalTime - startDateTime;
      },

      get bytesPerSecond(): number {
        const { bpsLog } = self;
        const mean = bpsLog.reduce((a, b) => a + b) / bpsLog.length;
        if (mean <= Number.EPSILON) return 0;
        return mean;
      },

      get bytesPerSecondSharp(): number {
        // Get's the exact BPS of the last update rather than the mean of the
        // last 5
        const { bpsLog } = self;
        return bpsLog[bpsLog.length - 1];
      },

      get msTotal(): number | undefined {
        const { bytesPerSecond, bytesTotal } = this;
        if (typeof bytesTotal !== "number") return;
        return Math.floor((bytesTotal / bytesPerSecond) * 1000);
      },

      get msRemaining(): number | undefined {
        const { msTotal, msElapsed, bytesRemaining } = this;
        if (typeof msTotal !== "number") return;
        if (bytesRemaining === 0) return 0;
        return msTotal - msElapsed;
      }
    };
  }

  updateBytes(newBytesCompleted: number) {
    if (!this.started) {
      throw new Error("Transfer not started. Call start() before you call updateBytes()");
    }
    if (!this.paused) {
      const lastBytesCompleted = this.bytesCompleted || 0;
      const currentTime = new Date().getTime();
      const lastUpdatedDateTime = this.updatedDateTime || new Date().getTime();
      const updatedDateTime = currentTime;
      const bps = ((newBytesCompleted - lastBytesCompleted) / (updatedDateTime - lastUpdatedDateTime)) * 1000;
      this.bpsLog.set([...this.bpsLog.subarray(1, this.bpsLog.length - 1), bps]);
      this.lastUpdatedDateTime = lastUpdatedDateTime;
      this.updatedDateTime = updatedDateTime;
      this.lastBytesCompleted = lastBytesCompleted;
    }

    this.bytesCompleted = newBytesCompleted;
  }

  start() {
    this.started = true;
    if (!this.startDateTime) {
      const currentTime = new Date().getTime();
      this.startDateTime = currentTime;
      this.lastUpdatedDateTime = currentTime;
      this.updatedDateTime = currentTime;
    }
  }

  pause() {
    const { paused } = this;
    if (paused) return;
    const currentTime = new Date().getTime();
    this.pausedStartDateTime = currentTime;
    this.bpsLog = new Uint32Array(5);
    this.paused = true;
  }

  resume() {
    const { pausedStartDateTime, pausedTotalTime, paused } = this;
    if (!paused) return;
    const currentTime = new Date().getTime();
    const msPauseDuration = currentTime - (pausedStartDateTime || 0);
    this.pausedTotalTime = pausedTotalTime + msPauseDuration;
    this.updatedDateTime = currentTime;
    this.paused = false;
  }

  finish() {
    this.finished = true;
    this.started = false;
    this.endDateTime = new Date().getTime();
  }
}
