import type { AdbPort } from "../../ports/adb-port.js";
import type { CommandRunnerPort } from "../../ports/command-runner-port.js";
import { defaultTimeouts, runAdb } from "./command-helpers.js";

export class AdbAdapter implements AdbPort {
  constructor(private readonly commandRunner: CommandRunnerPort) {}

  async listDevices() {
    const devices = await runAdb(this.commandRunner, ["devices"], defaultTimeouts.long);

    return devices.stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .filter((line) => !line.startsWith("List of devices attached"))
      .map((line) => line.split(/\s+/))
      .filter((parts) => (parts[0] ?? "").length > 0 && (parts[1] ?? "").length > 0)
      .map((parts) => ({
        serial: parts[0] ?? "",
        state: parts[1] ?? "",
      }));
  }

  async hasOnlineDevice() {
    const serials = await this.listOnlineDeviceSerials();
    return serials.length > 0;
  }

  async listOnlineDeviceSerials() {
    const devices = await this.listDevices();
    return devices
      .filter((device) => device.state === "device")
      .map((device) => device.serial);
  }

  async getBootCompleted(serial: string) {
    const { stdout } = await runAdb(
      this.commandRunner,
      ["-s", serial, "shell", "getprop", "sys.boot_completed"],
      defaultTimeouts.short
    );
    return stdout.trim() === "1";
  }

  async getEmulatorAvdName(serial: string) {
    try {
      const { stdout } = await runAdb(
        this.commandRunner,
        ["-s", serial, "emu", "avd", "name"],
        defaultTimeouts.short
      );

      const line = stdout
        .split(/\r?\n/)
        .map((value) => value.trim())
        .find((value) => value.length > 0 && value.toUpperCase() !== "OK");

      if (!line || line.startsWith("KO:")) {
        return undefined;
      }

      return line;
    } catch {
      return undefined;
    }
  }

  async killEmulator(serial: string) {
    await runAdb(this.commandRunner, ["-s", serial, "emu", "kill"], defaultTimeouts.short);
  }
}
