import type { AdbPort } from "../ports/adb-port.js";
import { ToolError } from "../shared/errors/tool-error.js";

export type AvdDeviceStatus = {
  serial: string;
  state: string;
  isEmulator: boolean;
  avdName?: string;
  bootCompleted: boolean | null;
};

export type AvdStatusOutput = {
  requestedSerial?: string;
  generatedAt: string;
  devices: AvdDeviceStatus[];
  summary: {
    total: number;
    online: number;
    emulators: number;
    bootCompleted: number;
  };
};

export class AvdStatusUseCase {
  constructor(private readonly adbPort: AdbPort) {}

  async execute(serial?: string): Promise<AvdStatusOutput> {
    const allDevices = await this.adbPort.listDevices();

    if (serial && !allDevices.some((device) => device.serial === serial)) {
      throw new ToolError({
        code: "SERIAL_NOT_FOUND",
        message: `Serial \"${serial}\" não encontrado na lista do adb devices.`,
        technicalDetails: `knownSerials=${allDevices.map((device) => device.serial).join(",") || "none"}`,
      });
    }

    const selectedDevices = serial
      ? allDevices.filter((device) => device.serial === serial)
      : allDevices;

    const devices: AvdDeviceStatus[] = [];

    for (const device of selectedDevices) {
      const isEmulator = device.serial.startsWith("emulator-");
      const isOnline = device.state === "device";

      let avdName: string | undefined;
      if (isEmulator) {
        avdName = await this.adbPort.getEmulatorAvdName(device.serial);
      }

      let bootCompleted: boolean | null = null;
      if (isOnline) {
        try {
          bootCompleted = await this.adbPort.getBootCompleted(device.serial);
        } catch {
          bootCompleted = null;
        }
      }

      devices.push({
        serial: device.serial,
        state: device.state,
        isEmulator,
        ...(avdName ? { avdName } : {}),
        bootCompleted,
      });
    }

    return {
      ...(serial ? { requestedSerial: serial } : {}),
      generatedAt: new Date().toISOString(),
      devices,
      summary: {
        total: devices.length,
        online: devices.filter((device) => device.state === "device").length,
        emulators: devices.filter((device) => device.isEmulator).length,
        bootCompleted: devices.filter((device) => device.bootCompleted === true).length,
      },
    };
  }
}
