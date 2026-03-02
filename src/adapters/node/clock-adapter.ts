import type { ClockPort } from "../../ports/clock-port.js";

export class ClockAdapter implements ClockPort {
  sleep(ms: number) {
    return new Promise<void>((resolve) => {
      setTimeout(resolve, ms);
    });
  }
}
