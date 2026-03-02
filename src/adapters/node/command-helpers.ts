import { existsSync } from "node:fs";
import { join } from "node:path";

import type { CommandResult } from "../../ports/command-runner-port.js";
import type { CommandRunnerPort } from "../../ports/command-runner-port.js";

export const defaultTimeouts = {
  short: 30_000,
  medium: 60_000,
  long: 5 * 60_000,
} as const;

function withExecutableSuffix(command: string) {
  if (process.platform !== "win32") return command;
  return command.endsWith(".exe") ? command : `${command}.exe`;
}

function resolveFromSdk(command: "adb" | "emulator"): string | undefined {
  const sdkRoot = process.env.ANDROID_SDK_ROOT ?? process.env.ANDROID_HOME;
  if (!sdkRoot) return undefined;

  const relativePath =
    command === "adb"
      ? join("platform-tools", withExecutableSuffix("adb"))
      : join("emulator", withExecutableSuffix("emulator"));

  const absolutePath = join(sdkRoot, relativePath);
  if (existsSync(absolutePath)) {
    return absolutePath;
  }

  return undefined;
}

function resolveCommand(command: "adb" | "emulator") {
  return resolveFromSdk(command) ?? command;
}

export function runAdb(
  commandRunner: CommandRunnerPort,
  args: string[],
  timeout: number = defaultTimeouts.long
): Promise<CommandResult> {
  return commandRunner.run(resolveCommand("adb"), args, timeout);
}

export function runEmulator(
  commandRunner: CommandRunnerPort,
  args: string[],
  timeout: number = defaultTimeouts.medium
): Promise<CommandResult> {
  return commandRunner.run(resolveCommand("emulator"), args, timeout);
}
