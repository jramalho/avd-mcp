import type { AdbPort } from "../ports/adb-port.js";
import type { ClockPort } from "../ports/clock-port.js";
import { ToolError } from "../shared/errors/tool-error.js";

const DEFAULT_GONE_TIMEOUT_MS = 10_000;
const DEFAULT_BOOT_TIMEOUT_MS = 120_000;

export async function waitForDeviceGone(
  adbPort: AdbPort,
  clockPort: ClockPort,
  serial: string,
  timeoutMs = DEFAULT_GONE_TIMEOUT_MS,
  pollMs = 500
): Promise<void> {
  const maxAttempts = Math.max(1, Math.ceil(timeoutMs / pollMs));

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const devices = await adbPort.listDevices();
    if (!devices.some((device) => device.serial === serial)) {
      return;
    }
    await clockPort.sleep(pollMs);
  }

  throw new ToolError({
    code: "AVD_STOP_TIMEOUT",
    message: `Timeout aguardando o emulador \"${serial}\" desligar.`,
    technicalDetails: `waitedMs=${timeoutMs}`,
  });
}

export async function waitForBootCompleted(
  adbPort: AdbPort,
  clockPort: ClockPort,
  serial: string,
  timeoutMs = DEFAULT_BOOT_TIMEOUT_MS,
  pollMs = 2_000
): Promise<void> {
  const maxAttempts = Math.max(1, Math.ceil(timeoutMs / pollMs));

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const onlineSerials = await adbPort.listOnlineDeviceSerials();
    if (onlineSerials.includes(serial)) {
      try {
        const bootCompleted = await adbPort.getBootCompleted(serial);
        if (bootCompleted) {
          return;
        }
      } catch {
      }
    }

    await clockPort.sleep(pollMs);
  }

  throw new ToolError({
    code: "BOOT_TIMEOUT",
    message: `Timeout aguardando boot completo do device \"${serial}\".`,
    technicalDetails: `waitedMs=${timeoutMs}`,
  });
}
