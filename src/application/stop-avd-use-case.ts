import type { AdbPort } from "../ports/adb-port.js";
import type { ClockPort } from "../ports/clock-port.js";

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
      throw new Error("Nenhum emulador online para encerrar.");
    }

    const targetSerial = serial ?? emulatorSerials[0]!;

    if (!emulatorSerials.includes(targetSerial)) {
      throw new Error(
        `Serial \"${targetSerial}\" não é um emulador online. Emuladores: ${emulatorSerials.join(", ")}`
      );
    }

    await this.adbPort.killEmulator(targetSerial);

    for (let i = 0; i < 20; i++) {
      await this.clockPort.sleep(500);
      const online = await this.adbPort.listOnlineDeviceSerials();
      if (!online.includes(targetSerial)) {
        return {
          stoppedSerial: targetSerial,
          onlineDevicesAfterStop: online,
        };
      }
    }

    throw new Error(
      `Timeout aguardando o emulador \"${targetSerial}\" desligar.`
    );

  }
}
