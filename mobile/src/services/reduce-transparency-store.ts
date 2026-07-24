export type ReduceTransparencyAdapter = {
  supported: boolean;
  read: () => Promise<boolean>;
  listen: (listener: (enabled: boolean) => void) => () => void;
};

type Listener = () => void;

export class ReduceTransparencyStore {
  private value = false;
  private readonly listeners = new Set<Listener>();
  private nativeUnsubscribe: (() => void) | null = null;
  private generation = 0;
  private eventRevision = 0;

  constructor(private readonly adapter: ReduceTransparencyAdapter) {}

  getSnapshot = (): boolean => this.value;

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    if (this.listeners.size === 1) this.start();

    let subscribed = true;
    return () => {
      if (!subscribed) return;
      subscribed = false;
      this.listeners.delete(listener);
      if (this.listeners.size === 0) this.stop();
    };
  };

  private start(): void {
    if (!this.adapter.supported || this.nativeUnsubscribe) return;
    const generation = ++this.generation;
    const initialRevision = this.eventRevision;

    this.nativeUnsubscribe = this.adapter.listen((enabled) => {
      if (generation !== this.generation) return;
      this.eventRevision += 1;
      this.publish(enabled);
    });
    void this.adapter.read()
      .then((enabled) => {
        if (
          generation === this.generation &&
          initialRevision === this.eventRevision
        ) {
          this.publish(enabled);
        }
      })
      .catch(() => undefined);
  }

  private stop(): void {
    this.generation += 1;
    this.nativeUnsubscribe?.();
    this.nativeUnsubscribe = null;
  }

  private publish(value: boolean): void {
    if (this.value === value) return;
    this.value = value;
    this.listeners.forEach((listener) => listener());
  }
}
