import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import type { AdbRunner } from "../adb/runner.js";
import { resolveAdbExecutable } from "../adb/runner.js";
import { ToolError } from "../shared/errors/tool-error.js";
import { MediaArtifacts } from "./media-artifacts.js";

export type ScreenrecordStartInput = {
  serial?: string;
  maxDurationSeconds: number;
  bitRate?: number;
  size?: string;
};

export type ScreenrecordStartOutput = {
  sessionId: string;
  serial: string;
  remotePath: string;
  startedAt: string;
};

export type ScreenrecordStopInput = {
  serial?: string;
  sessionId: string;
  inlineBase64: boolean;
};

export type ScreenrecordStopOutput = {
  sessionId: string;
  serial: string;
  remotePath: string;
  localPath: string;
  durationMs: number;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  inlineBase64?: string;
};

type ActiveRecordSession = {
  sessionId: string;
  serial: string;
  remotePath: string;
  process: ChildProcess;
  startedAtMs: number;
  closed: boolean;
  exitCode: number | null;
};

function parseAdbDevices(stdout: string): Array<{ serial: string; state: string }> {
  return stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .filter((line) => !line.startsWith("List of devices attached"))
    .map((line) => line.split(/\s+/))
    .filter((parts) => (parts[0] ?? "").length > 0 && (parts[1] ?? "").length > 0)
    .map((parts) => ({ serial: parts[0] ?? "", state: parts[1] ?? "" }));
}

export class ScreenrecordSessionManager {
  private readonly sessions = new Map<string, ActiveRecordSession>();

  constructor(
    private readonly adbRunner: AdbRunner,
    private readonly artifacts: MediaArtifacts
  ) {}

  private async resolveSerial(serial?: string): Promise<string> {
    if (serial) return serial;

    const devicesResult = await this.adbRunner.runAdbCommand({
      args: ["devices"],
      timeoutMs: 15_000,
    });

    const target = parseAdbDevices(devicesResult.stdout).find(
      (device) => device.state === "device" && device.serial.startsWith("emulator-")
    );

    if (!target) {
      throw new ToolError({
        code: "NO_EMULATOR_ONLINE",
        message: "Nenhum emulador online para iniciar screenrecord.",
      });
    }

    return target.serial;
  }

  async start(input: ScreenrecordStartInput): Promise<ScreenrecordStartOutput> {
    const serial = await this.resolveSerial(input.serial);
    const sessionId = randomUUID();
    const remotePath = `/sdcard/mcp_record_${Date.now()}.mp4`;

    const args = [
      ...(serial ? ["-s", serial] : []),
      "shell",
      "screenrecord",
      remotePath,
      "--time-limit",
      String(input.maxDurationSeconds),
      ...(input.bitRate ? ["--bit-rate", String(input.bitRate)] : []),
      ...(input.size ? ["--size", input.size] : []),
    ];

    const process = spawn(resolveAdbExecutable(), args, {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });

    const session: ActiveRecordSession = {
      sessionId,
      serial,
      remotePath,
      process,
      startedAtMs: Date.now(),
      closed: false,
      exitCode: null,
    };

    process.on("close", (code) => {
      session.closed = true;
      session.exitCode = code ?? null;
    });

    this.sessions.set(sessionId, session);

    return {
      sessionId,
      serial,
      remotePath,
      startedAt: new Date(session.startedAtMs).toISOString(),
    };
  }

  async stop(input: ScreenrecordStopInput): Promise<ScreenrecordStopOutput> {
    const session = this.sessions.get(input.sessionId);
    if (!session) {
      throw new ToolError({
        code: "SCREENRECORD_SESSION_NOT_FOUND",
        message: `SessionId \"${input.sessionId}\" não encontrado.`,
      });
    }

    if (input.serial && input.serial !== session.serial) {
      throw new ToolError({
        code: "SERIAL_MISMATCH",
        message: `Serial informado não corresponde à sessão ${input.sessionId}.`,
      });
    }

    if (!session.closed) {
      session.process.kill();
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }

    await this.artifacts.ensureDirs();
    const localPath = join(this.artifacts.getRecordsDir(), `${session.sessionId}.mp4`);

    const pullResult = await this.adbRunner.runAdbCommand({
      serial: session.serial,
      args: ["pull", session.remotePath, localPath],
      timeoutMs: 60_000,
    });

    await this.adbRunner.runAdbCommand({
      serial: session.serial,
      args: ["shell", "rm", session.remotePath],
      timeoutMs: 15_000,
    }).catch(() => undefined);

    this.sessions.delete(input.sessionId);

    const output: ScreenrecordStopOutput = {
      sessionId: session.sessionId,
      serial: session.serial,
      remotePath: session.remotePath,
      localPath,
      durationMs: Date.now() - session.startedAtMs,
      exitCode: pullResult.exitCode,
      stdout: pullResult.stdout,
      stderr: pullResult.stderr,
    };

    if (input.inlineBase64) {
      const file = await readFile(localPath);
      output.inlineBase64 = file.toString("base64");
    }

    return output;
  }
}
