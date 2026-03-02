import type { AdbPort } from "../ports/adb-port.js";
import type { ClockPort } from "../ports/clock-port.js";
import { ToolError } from "../shared/errors/tool-error.js";
import { waitForDeviceGone } from "./adb-waiters.js";

export type StopAvdOutput = {
  stoppedSerial: string;
  onlineDevicesAfterStop: string[];
};

export class StopAvdUseCase {
  constructor(
    private readonly adbPort: AdbPort,
    private readonly clockPort: ClockPort
  ) {}

  async execute(serial?: string): Promise<StopAvdOutput> {
    const devices = await this.adbPort.listOnlineDeviceSerials();
    const emulatorSerials = devices.filter((device) => device.startsWith("emulator-"));

    if (!emulatorSerials.length) {
      throw new ToolError({
        code: "NO_EMULATOR_ONLINE",
        message: "Nenhum emulador online para encerrar.",
      });
    }

    const targetSerial = serial ?? emulatorSerials[0]!;

    if (!emulatorSerials.includes(targetSerial)) {
      throw new ToolError({
        code: "SERIAL_NOT_ONLINE",
        message: `Serial \"${targetSerial}\" não é um emulador online.`,
        technicalDetails: `onlineEmulators=${emulatorSerials.join(",")}`,
      });
    }

    await this.adbPort.killEmulator(targetSerial);
    await waitForDeviceGone(this.adbPort, this.clockPort, targetSerial);

    const online = await this.adbPort.listOnlineDeviceSerials();
    return {
      stoppedSerial: targetSerial,
      onlineDevicesAfterStop: online,
    };

  }
}
