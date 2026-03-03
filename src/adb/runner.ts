import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

import { assertSafeAdbShellArgs } from "./shell-safety.js";

const DEFAULT_TIMEOUT_MS = 30_000;

export type RunAdbCommandInput = {
  serial?: string;
  args: string[];
  timeoutMs?: number;
  responseType?: "text" | "binary";
};

export type RunAdbCommandOutput = {
  stdout: string;
  stdoutBuffer: Buffer;
  stderr: string;
  exitCode: number;
  durationMs: number;
};

export type ProcessExecutionInput = {
  executable: string;
  args: string[];
  timeoutMs: number;
};

export type ProcessExecutionOutput = {
  stdout: string;
  stdoutBuffer: Buffer;
  stderr: string;
  exitCode: number;
};

export type ProcessExecutor = (input: ProcessExecutionInput) => Promise<ProcessExecutionOutput>;

function withExecutableSuffix(command: string) {
  if (process.platform !== "win32") return command;
  return command.endsWith(".exe") ? command : `${command}.exe`;
}

export function resolveAdbExecutable(): string {
  const sdkRoot = process.env.ANDROID_SDK_ROOT ?? process.env.ANDROID_HOME;
  if (!sdkRoot) {
    return "adb";
  }

  const candidate = join(sdkRoot, "platform-tools", withExecutableSuffix("adb"));
  return existsSync(candidate) ? candidate : "adb";
}

function validateArg(arg: string) {
  if (arg.length === 0) {
    throw new Error("Argumento vazio não é permitido.");
  }

  const forbidden = /[\n\r;&|><`$]/;
  if (forbidden.test(arg)) {
    throw new Error(`Argumento inseguro detectado: ${arg}`);
  }
}

function sanitizeArgs(args: string[]) {
  if (!Array.isArray(args) || args.length === 0) {
    throw new Error("args deve conter ao menos um argumento.");
  }

  for (const arg of args) {
    validateArg(arg);
  }

  return args;
}

export const defaultProcessExecutor: ProcessExecutor = ({ executable, args, timeoutMs }) => {
  return new Promise((resolve) => {
    const child = spawn(executable, args, {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });

    const stdoutChunks: Buffer[] = [];
    let stderr = "";
    let finished = false;

    const timer = setTimeout(() => {
      if (finished) return;
      child.kill();
      finished = true;
      resolve({
        stdout: Buffer.concat(stdoutChunks).toString("utf8"),
        stdoutBuffer: Buffer.concat(stdoutChunks),
        stderr: `${stderr}\nProcess timeout after ${timeoutMs}ms`.trim(),
        exitCode: 124,
      });
    }, timeoutMs);

    child.stdout?.on("data", (chunk) => {
      stdoutChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk ?? "")));
    });

    child.stderr?.on("data", (chunk) => {
      stderr += String(chunk ?? "");
    });

    child.on("error", (error) => {
      if (finished) return;
      clearTimeout(timer);
      finished = true;
      resolve({
        stdout: Buffer.concat(stdoutChunks).toString("utf8"),
        stdoutBuffer: Buffer.concat(stdoutChunks),
        stderr: `${stderr}\n${error.name}: ${error.message}`.trim(),
        exitCode: 1,
      });
    });

    child.on("close", (code) => {
      if (finished) return;
      clearTimeout(timer);
      finished = true;
      resolve({
        stdout: Buffer.concat(stdoutChunks).toString("utf8"),
        stdoutBuffer: Buffer.concat(stdoutChunks),
        stderr,
        exitCode: code ?? 1,
      });
    });
  });
};

export class AdbRunner {
  constructor(
    private readonly processExecutor: ProcessExecutor = defaultProcessExecutor,
    private readonly defaultTimeoutMs = DEFAULT_TIMEOUT_MS
  ) {}

  async runAdbCommand(input: RunAdbCommandInput): Promise<RunAdbCommandOutput> {
    const startedAt = Date.now();
    const timeoutMs = input.timeoutMs ?? this.defaultTimeoutMs;
    const safeArgs = sanitizeArgs(input.args);

    if (safeArgs[0] === "shell") {
      assertSafeAdbShellArgs(safeArgs.slice(1));
    }

    const commandArgs = [
      ...(input.serial ? ["-s", input.serial] : []),
      ...safeArgs,
    ];

    const result = await this.processExecutor({
      executable: resolveAdbExecutable(),
      args: commandArgs,
      timeoutMs,
    });

    return {
      stdout: input.responseType === "binary" ? "" : result.stdout,
      stdoutBuffer: result.stdoutBuffer,
      stderr: result.stderr,
      exitCode: result.exitCode,
      durationMs: Date.now() - startedAt,
    };
  }
}
