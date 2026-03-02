import type { BootOptions } from "../domain/avd.js";

export interface EmulatorPort {
  listAvds(): Promise<string[]>;
  start(avdName: string, options: BootOptions): Promise<void>;
}
