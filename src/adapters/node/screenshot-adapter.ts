import { mkdir, readFile } from "node:fs/promises";
import os from "node:os";
import { join } from "node:path";

import { defaultTimeouts, runAdb } from "./command-helpers.js";
import type { CommandRunnerPort } from "../../ports/command-runner-port.js";
import type { ScreenshotPort } from "../../ports/screenshot-port.js";

export class ScreenshotAdapter implements ScreenshotPort {
  constructor(private readonly commandRunner: CommandRunnerPort) {}

  async capturePng(serial?: string) {
    const tmpRemote = "/sdcard/__mcp_screen.png";
    const dir = join(os.tmpdir(), "avd-mcp");
    await mkdir(dir, { recursive: true });
    const file = join(dir, `screen-${Date.now()}.png`);
    const serialArgs = serial ? ["-s", serial] : [];

    await runAdb(this.commandRunner, [...serialArgs, "shell", "screencap", "-p", tmpRemote], defaultTimeouts.long);
    await runAdb(this.commandRunner, [...serialArgs, "pull", tmpRemote, file], defaultTimeouts.long);
    await runAdb(this.commandRunner, [...serialArgs, "shell", "rm", tmpRemote], defaultTimeouts.long);

    return readFile(file);
  }
}
