export interface ClockPort {
  sleep(ms: number): Promise<void>;
}
