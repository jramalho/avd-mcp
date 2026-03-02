import { randomUUID } from "node:crypto";

import type { BootOptions } from "../domain/avd.js";
import type { AdbPort } from "../ports/adb-port.js";
import type { ClockPort } from "../ports/clock-port.js";
import { ToolError } from "../shared/errors/tool-error.js";
import { waitForBootCompleted, waitForDeviceGone } from "./adb-waiters.js";
import type { StartAvdUseCase } from "./start-avd-use-case.js";

export type AvdRestartInput = BootOptions & {
  serial?: string;
  waitForBoot: boolean;
};

export type AvdRestartOutput = {
  traceId: string;
  targetSerial: string;
  avdName: string;
  stopDurationMs: number;
  startDurationMs: number;
  totalDurationMs: number;
  onlineDevicesAfterRestart: string[];
};

export class AvdRestartUseCase {
  constructor(
    private readonly adbPort: AdbPort,
    private readonly clockPort: ClockPort,
    private readonly startAvdUseCase: StartAvdUseCase
  ) {}

  async execute(input: AvdRestartInput): Promise<AvdRestartOutput> {
    const traceId = randomUUID();
    const totalStart = Date.now();

    const devices = await this.adbPort.listDevices();
    const onlineEmulators = devices.filter(
      (device) => device.state === "device" && device.serial.startsWith("emulator-")
    );

    const targetSerial = input.serial ?? onlineEmulators[0]?.serial;
    if (!targetSerial) {
      throw new ToolError({
        code: "NO_EMULATOR_ONLINE",
        message: "Nenhum emulador online para reiniciar.",
      });
    }

    const targetIsOnlineEmulator = onlineEmulators.some((device) => device.serial === targetSerial);
    if (!targetIsOnlineEmulator) {
      throw new ToolError({
        code: "SERIAL_NOT_ONLINE",
        message: `Serial \"${targetSerial}\" não é um emulador online.`,
        technicalDetails: `onlineEmulators=${onlineEmulators.map((device) => device.serial).join(",") || "none"}`,
      });
    }

    const avdName = await this.adbPort.getEmulatorAvdName(targetSerial);
    if (!avdName) {
      throw new ToolError({
        code: "AVD_NAME_UNAVAILABLE",
        message: `Não foi possível descobrir o nome do AVD para o serial \"${targetSerial}\".`,
      });
    }

    const stopStartedAt = Date.now();
    await this.adbPort.killEmulator(targetSerial);
    await waitForDeviceGone(this.adbPort, this.clockPort, targetSerial);
    const stopDurationMs = Date.now() - stopStartedAt;

    const startStartedAt = Date.now();
    await this.startAvdUseCase.execute({
      avdName,
      coldBoot: input.coldBoot,
      wipeData: input.wipeData,
      noWindow: input.noWindow,
      readOnly: input.readOnly,
      ...(input.gpuMode ? { gpuMode: input.gpuMode } : {}),
      waitForBoot: input.waitForBoot,
      forceStart: true,
      waitForSerial: targetSerial,
    });

    if (input.waitForBoot) {
      await waitForBootCompleted(this.adbPort, this.clockPort, targetSerial);
    }

    const startDurationMs = Date.now() - startStartedAt;

    return {
      traceId,
      targetSerial,
      avdName,
      stopDurationMs,
      startDurationMs,
      totalDurationMs: Date.now() - totalStart,
      onlineDevicesAfterRestart: await this.adbPort.listOnlineDeviceSerials(),
    };
  }
}
