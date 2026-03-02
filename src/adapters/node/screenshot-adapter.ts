import { mkdir, readFile } from "node:fs/promises";
import os from "node:os";
import { join } from "node:path";

import type { CommandRunnerPort } from "../../ports/command-runner-port.js";
import type { ScreenshotPort } from "../../ports/screenshot-port.js";

export class ScreenshotAdapter implements ScreenshotPort {
  constructor(private readonly commandRunner: CommandRunnerPort) {}

  async capturePng() {
    const tmpRemote = "/sdcard/__mcp_screen.png";
    const dir = join(os.tmpdir(), "avd-mcp");
    await mkdir(dir, { recursive: true });
    const file = join(dir, `screen-${Date.now()}.png`);

    await this.commandRunner.run("adb", ["shell", "screencap", "-p", tmpRemote], 5 * 60_000);
    await this.commandRunner.run("adb", ["pull", tmpRemote, file], 5 * 60_000);
    await this.commandRunner.run("adb", ["shell", "rm", tmpRemote], 5 * 60_000);

    return readFile(file);
  }
}
