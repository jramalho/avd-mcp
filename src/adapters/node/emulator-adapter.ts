import type { BootOptions } from "../../domain/avd.js";
import type { CommandRunnerPort } from "../../ports/command-runner-port.js";
import type { EmulatorPort } from "../../ports/emulator-port.js";
import { defaultTimeouts, runEmulator } from "./command-helpers.js";

export class EmulatorAdapter implements EmulatorPort {
  constructor(private readonly commandRunner: CommandRunnerPort) {}

  async listAvds() {
    const { stdout } = await runEmulator(this.commandRunner, ["-list-avds"], defaultTimeouts.medium);

    return stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  }

  async start(avdName: string, options: BootOptions) {
    const args = ["-avd", avdName, "-no-snapshot-save"];

    if (options.coldBoot) args.push("-no-snapshot-load");
    if (options.wipeData) args.push("-wipe-data");
    if (options.noWindow) args.push("-no-window");
    if (options.readOnly) args.push("-read-only");
    if (options.gpuMode) args.push("-gpu", options.gpuMode);

    await runEmulator(this.commandRunner, args, 5000);
  }
}
