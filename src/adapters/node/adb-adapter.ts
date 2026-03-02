import type { AdbPort } from "../../ports/adb-port.js";
import type { CommandRunnerPort } from "../../ports/command-runner-port.js";

export class AdbAdapter implements AdbPort {
  constructor(private readonly commandRunner: CommandRunnerPort) {}

  async hasOnlineDevice() {
    const serials = await this.listOnlineDeviceSerials();
    return serials.length > 0;
  }

  async listOnlineDeviceSerials() {
    const devices = await this.commandRunner.run("adb", ["devices"], 5 * 60_000);

    return devices.stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.endsWith("\tdevice"))
      .map((line) => line.split("\t")[0] ?? "")
      .filter(Boolean);
  }

  async killEmulator(serial: string) {
    await this.commandRunner.run("adb", ["-s", serial, "emu", "kill"], 30_000);
  }
}
