import type {
  BootOptions,
  RunAndScreenshotInput,
  RunAndScreenshotOutput,
} from "../domain/avd.js";
import type { AdbPort } from "../ports/adb-port.js";
import type { ClockPort } from "../ports/clock-port.js";
import type { EmulatorPort } from "../ports/emulator-port.js";
import type { ShellPort } from "../ports/shell-port.js";
import type { ScreenshotPort } from "../ports/screenshot-port.js";
import { ToolError } from "../shared/errors/tool-error.js";

export class RunAndScreenshotUseCase {
  constructor(
    private readonly adbPort: AdbPort,
    private readonly emulatorPort: EmulatorPort,
    private readonly shellPort: ShellPort,
    private readonly screenshotPort: ScreenshotPort,
    private readonly clockPort: ClockPort
  ) {}

  async execute(input: RunAndScreenshotInput): Promise<RunAndScreenshotOutput> {
    await this.ensureEmulator(input);

    const { stdout, stderr } = await this.shellPort
      .run(input.command, 30 * 60_000)
      .catch((error: unknown) => ({
        stdout: "",
        stderr: String(error),
      }));

    await this.clockPort.sleep(input.waitMsAfterRun);

    const screenshotPng = await this.screenshotPort.capturePng(input.serial);

    return {
      command: input.command,
      stdout,
      stderr,
      screenshotPng,
    };
  }

  private async ensureEmulator(options: BootOptions & { serial?: string }) {
    const onlineDevices = await this.adbPort.listOnlineDeviceSerials();

    if (options.serial) {
      if (onlineDevices.includes(options.serial)) {
        return;
      }

      throw new ToolError({
        code: "SERIAL_NOT_ONLINE",
        message: `O device ${options.serial} não está online. Inicie o emulador antes de capturar screenshot por serial.`,
        technicalDetails: `onlineDevices=${onlineDevices.join(",") || "none"}`,
      });
    }

    if (onlineDevices.length > 0) return;

    const avds = await this.emulatorPort.listAvds();
    if (!avds.length) {
      throw new ToolError({
        code: "NO_AVD_FOUND",
        message: "Nenhum AVD encontrado na máquina. Crie um AVD no Android Studio.",
      });
    }

    if (options.avdName && !avds.includes(options.avdName)) {
      throw new ToolError({
        code: "AVD_NOT_FOUND",
        message: `avdName \"${options.avdName}\" não encontrado.`,
        technicalDetails: `availableAvds=${avds.join(",")}`,
      });
    }

    const selectedAvd = options.avdName ?? avds[0]!;

    this.emulatorPort.start(selectedAvd, options).catch(() => {});

    for (let i = 0; i < 60; i++) {
      await this.clockPort.sleep(2000);
      if (await this.adbPort.hasOnlineDevice()) return;
    }

    throw new ToolError({
      code: "AVD_START_TIMEOUT",
      message: `Timeout esperando o AVD \"${selectedAvd}\" subir.`,
      technicalDetails: "waitedMs=120000",
    });
  }
}
