export type NotificationDeliveryJob = {
  id: string;
  title: string;
  body: string;
  route: string;
};

type PendingJob = {
  job: NotificationDeliveryJob;
  attempt: number;
};

export class NotificationDeliveryQueue {
  private readonly pending = new Map<string, PendingJob>();
  private running = false;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly deliver: (job: NotificationDeliveryJob) => Promise<void>,
    private readonly retryDelays: readonly number[] = [500, 2_000],
  ) {}

  enqueue(jobs: readonly NotificationDeliveryJob[]): void {
    jobs.forEach((job) => {
      if (!this.pending.has(job.id)) {
        this.pending.set(job.id, { job, attempt: 0 });
      }
    });
    this.start();
  }

  retryPending(): void {
    this.pending.forEach((pending) => {
      pending.attempt = 0;
    });
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    this.start();
  }

  clear(): void {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    this.pending.clear();
  }

  dispose(): void {
    this.clear();
  }

  private start(): void {
    if (!this.running && !this.retryTimer && this.pending.size) {
      void this.drain();
    }
  }

  private async drain(): Promise<void> {
    this.running = true;
    const pending = this.pending.values().next().value as PendingJob | undefined;
    if (!pending) {
      this.running = false;
      return;
    }

    try {
      await this.deliver(pending.job);
      this.pending.delete(pending.job.id);
      this.running = false;
      this.start();
    } catch {
      const delay = this.retryDelays[pending.attempt];
      pending.attempt += 1;
      this.running = false;
      if (delay === undefined) return;
      this.retryTimer = setTimeout(() => {
        this.retryTimer = null;
        this.start();
      }, delay);
    }
  }
}
