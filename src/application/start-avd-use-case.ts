import type { BootOptions } from "../domain/avd.js";
import type { AdbPort } from "../ports/adb-port.js";
import type { ClockPort } from "../ports/clock-port.js";
import type { EmulatorPort } from "../ports/emulator-port.js";
import { ToolError } from "../shared/errors/tool-error.js";

export type StartAvdInput = BootOptions & {
  waitForBoot: boolean;
  forceStart?: boolean;
  waitForSerial?: string;
};

export type StartAvdOutput = {
  status: "already-online" | "started";
  selectedAvd?: string;
  onlineDevices: string[];
};

export class StartAvdUseCase {
  constructor(
    private readonly adbPort: AdbPort,
    private readonly emulatorPort: EmulatorPort,
    private readonly clockPort: ClockPort
  ) {}

  async execute(input: StartAvdInput): Promise<StartAvdOutput> {
    const onlineDevices = await this.adbPort.listOnlineDeviceSerials();
    if (!input.forceStart && onlineDevices.length > 0) {
      return { status: "already-online", onlineDevices };
    }

    const avds = await this.emulatorPort.listAvds();
    if (!avds.length) {
      throw new ToolError({
        code: "NO_AVD_FOUND",
        message: "Nenhum AVD encontrado na máquina. Crie um AVD no Android Studio.",
      });
    }

    if (input.avdName && !avds.includes(input.avdName)) {
      throw new ToolError({
        code: "AVD_NOT_FOUND",
        message: `avdName \"${input.avdName}\" não encontrado.`,
        technicalDetails: `availableAvds=${avds.join(",")}`,
      });
    }

    const selectedAvd = input.avdName ?? avds[0]!;
    this.emulatorPort.start(selectedAvd, input).catch(() => {});

    if (!input.waitForBoot) {
      return {
        status: "started",
        selectedAvd,
        onlineDevices: [],
      };
    }

    for (let i = 0; i < 60; i++) {
      await this.clockPort.sleep(2000);
      const bootedDevices = await this.adbPort.listOnlineDeviceSerials();
      const hasExpectedSerial = input.waitForSerial
        ? bootedDevices.includes(input.waitForSerial)
        : bootedDevices.length > 0;

      if (hasExpectedSerial) {
        return {
          status: "started",
          selectedAvd,
          onlineDevices: bootedDevices,
        };
      }
    }

    throw new ToolError({
      code: "AVD_START_TIMEOUT",
      message: `Timeout esperando o AVD \"${selectedAvd}\" subir.`,
      technicalDetails: "waitedMs=120000",
    });
  }
}
