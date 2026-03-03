import { randomUUID } from "node:crypto";

import { z } from "zod";

import type { CallToolRequest } from "@modelcontextprotocol/sdk/types.js";
import { gpuModes } from "../../domain/avd.js";
import type { AdbRunner } from "../../adb/runner.js";
import {
  assertSafeActivity,
  assertSafeCliCommand,
  assertSafePackageName,
  assertPathInsideWorkspace,
  assertSafePermissions,
  assertSafeUri,
} from "../../adb/app-validators.js";
import { assertSafeAdbShellCommand } from "../../adb/shell-safety.js";
import type { MediaConfig } from "../../media/media-config.js";
import type { ScreenrecordSessionManager } from "../../media/screenrecord-session-manager.js";
import type { ScreenshotService } from "../../media/screenshot-service.js";
import type { AvdRestartUseCase } from "../../application/avd-restart-use-case.js";
import type { AvdStatusUseCase } from "../../application/avd-status-use-case.js";
import type { ListAvdsUseCase } from "../../application/list-avds-use-case.js";
import type { RunAndScreenshotUseCase } from "../../application/run-and-screenshot-use-case.js";
import type { StartAvdUseCase } from "../../application/start-avd-use-case.js";
import type { StopAvdUseCase } from "../../application/stop-avd-use-case.js";
import { logError, logInfo } from "../../observability/logger.js";
import { getMetricsSnapshot, recordToolExecution } from "../../observability/metrics.js";
import { ToolError, toToolError } from "../../shared/errors/tool-error.js";
import {
  adbInstallApkSchema,
  adbLogcatSchema,
  adbShellSchema,
  adbUninstallSchema,
  appForceStopSchema,
  appLaunchSchema,
  clearAppDataSchema,
  screenrecordStartSchema,
  screenrecordStopSchema,
  screenshotSchema,
  avdRestartSchema,
  avdStatusSchema,
  grantPermissionsSchema,
  networkConditionSchema,
  networkToggleSchema,
  openDeeplinkSchema,
  runAndScreenshotSchema,
  getMetricsSchema,
  setBatteryStateSchema,
  setLocaleSchema,
  setLocationSchema,
  setRotationSchema,
  startAvdSchema,
  stopAvdSchema,
} from "./definitions.js";

type ToolResponse = {
  content: Array<
    | { type: "text"; text: string }
    | { type: "image"; data: string; mimeType: string }
  >;
};

type ToolDependencies = {
  listAvdsUseCase: ListAvdsUseCase;
  runAndScreenshotUseCase: RunAndScreenshotUseCase;
  startAvdUseCase: StartAvdUseCase;
  stopAvdUseCase: StopAvdUseCase;
  avdStatusUseCase: AvdStatusUseCase;
  avdRestartUseCase: AvdRestartUseCase;
  adbRunner: AdbRunner;
  screenrecordSessionManager: ScreenrecordSessionManager;
  screenshotService: ScreenshotService;
  mediaConfig: MediaConfig;
};

type ToolErrorPayload = {
  code: string;
  message: string;
  hints?: string[];
  validOptions?: unknown;
};

function toToolErrorPayload(error: ToolError): ToolErrorPayload {
  return {
    code: error.code,
    message: error.message,
    ...(error.hints && error.hints.length > 0 ? { hints: error.hints } : {}),
    ...(error.validOptions !== undefined ? { validOptions: error.validOptions } : {}),
  };
}

function formatToolErrorText(error: ToolError) {
  return JSON.stringify(toToolErrorPayload(error), null, 2);
}

async function parseToolArguments<TSchema extends z.ZodTypeAny>(
  schema: TSchema,
  args: unknown,
  toolName: string
): Promise<z.output<TSchema>> {
  const parsed = await schema.safeParseAsync(args ?? {});
  if (parsed.success) return parsed.data;

  const gpuModeIssue = parsed.error.issues.find(
    (issue) => issue.path[0] === "gpuMode"
  );

  if (gpuModeIssue) {
    const invalidGpuMode =
      typeof args === "object" && args !== null
        ? (args as { gpuMode?: unknown }).gpuMode
        : undefined;

    throw new ToolError({
      code: "INVALID_GPU_MODE",
      message: `gpuMode inválido${typeof invalidGpuMode === "string" ? `: ${invalidGpuMode}` : ""}.`,
      hints: [
        `Use um dos valores suportados: ${gpuModes.join(", ")}.`,
      ],
      validOptions: gpuModes,
      technicalDetails: parsed.error.flatten().formErrors.join(" | "),
      cause: parsed.error,
    });
  }

  throw new ToolError({
    code: "INVALID_INPUT",
    message: `Parâmetros inválidos para ${toolName}.`,
    technicalDetails: parsed.error.flatten().formErrors.join(" | "),
    cause: parsed.error,
  });
}

function extractDeviceId(args: unknown): string | null {
  if (typeof args !== "object" || args === null) return null;
  const maybeSerial = (args as { serial?: unknown }).serial;
  if (typeof maybeSerial === "string" && maybeSerial.trim().length > 0) {
    return maybeSerial;
  }
  return null;
}

async function runTool(
  toolName: string,
  rawArgs: unknown,
  operation: () => Promise<ToolResponse>
): Promise<ToolResponse> {
  const traceId = randomUUID();
  const startedAt = Date.now();
  const deviceId = extractDeviceId(rawArgs);

  logInfo({
    traceId,
    tool: toolName,
    message: "tool_call_started",
    data: {
      deviceId,
      success: null,
      durationMs: 0,
    },
  });

  try {
    const result = await operation();
    const durationMs = Date.now() - startedAt;
    recordToolExecution(toolName, durationMs);
    logInfo({
      traceId,
      tool: toolName,
      message: "tool_call_finished",
      data: {
        deviceId,
        success: true,
        durationMs,
      },
    });
    return result;
  } catch (error: unknown) {
    const toolError = toToolError(error, `Falha ao executar ${toolName}.`);
    const durationMs = Date.now() - startedAt;
    recordToolExecution(toolName, durationMs);
    logError({
      traceId,
      tool: toolName,
      message: "tool_call_finished",
      data: {
        deviceId,
        success: false,
        durationMs,
        code: toolError.code,
        errorMessage: toolError.message,
        technicalDetails: toolError.technicalDetails,
      },
    });

    return {
      content: [
        {
          type: "text",
          text: formatToolErrorText(toolError),
        },
      ],
    };
  }
}

type AdbOperationOutput = {
  command: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
};

async function runAdbOperation(
  adbRunner: AdbRunner,
  serial: string | undefined,
  args: string[],
  timeoutMs = 30_000
): Promise<AdbOperationOutput> {
  const result = await adbRunner.runAdbCommand({
    ...(serial ? { serial } : {}),
    args,
    timeoutMs,
  });

  return {
    command: `adb ${(serial ? `-s ${serial} ` : "")}${args.join(" ")}`,
    exitCode: result.exitCode,
    stdout: result.stdout,
    stderr: result.stderr,
    durationMs: result.durationMs,
  };
}

async function applyNetworkToggle(
  adbRunner: AdbRunner,
  serial: string | undefined,
  input: {
    wifiEnabled: boolean;
    dataEnabled?: boolean;
    airplaneMode?: boolean;
  }
) {
  const operations: AdbOperationOutput[] = [];

  operations.push(
    await runAdbOperation(adbRunner, serial, [
      "shell",
      "svc",
      "wifi",
      input.wifiEnabled ? "enable" : "disable",
    ])
  );

  if (input.dataEnabled !== undefined) {
    operations.push(
      await runAdbOperation(adbRunner, serial, [
        "shell",
        "svc",
        "data",
        input.dataEnabled ? "enable" : "disable",
      ])
    );
  }

  if (input.airplaneMode !== undefined) {
    operations.push(
      await runAdbOperation(adbRunner, serial, [
        "shell",
        "settings",
        "put",
        "global",
        "airplane_mode_on",
        input.airplaneMode ? "1" : "0",
      ])
    );
  }

  return operations;
}

type NetworkProfilePreset = {
  delay: string;
  speed: string;
  toggle?: {
    wifiEnabled: boolean;
    dataEnabled?: boolean;
    airplaneMode?: boolean;
  };
};

const NETWORK_PROFILE_PRESETS: Record<"good" | "slow_3g" | "lte" | "offline", NetworkProfilePreset> = {
  good: {
    delay: "none",
    speed: "full",
    toggle: { wifiEnabled: true, dataEnabled: true, airplaneMode: false },
  },
  slow_3g: {
    delay: "gprs",
    speed: "umts",
    toggle: { wifiEnabled: false, dataEnabled: true, airplaneMode: false },
  },
  lte: {
    delay: "none",
    speed: "lte",
    toggle: { wifiEnabled: false, dataEnabled: true, airplaneMode: false },
  },
  offline: {
    delay: "none",
    speed: "full",
    toggle: { wifiEnabled: false, dataEnabled: false, airplaneMode: true },
  },
};

function mapSpeedKbpsToProfile(speedKbps: number): string {
  if (speedKbps <= 80) return "gsm";
  if (speedKbps <= 144) return "hscsd";
  if (speedKbps <= 300) return "gprs";
  if (speedKbps <= 500) return "edge";
  if (speedKbps <= 1_600) return "umts";
  if (speedKbps <= 10_000) return "hsdpa";
  if (speedKbps <= 100_000) return "lte";
  return "full";
}

function normalizeLanguage(language: string): string {
  const normalized = language.trim().toLowerCase();
  if (!/^[a-z]{2,3}$/.test(normalized)) {
    throw new ToolError({
      code: "INVALID_INPUT",
      message: "language inválido. Use código ISO como pt ou en.",
      technicalDetails: `language=${language}`,
    });
  }
  return normalized;
}

function normalizeCountry(country: string | undefined): string | undefined {
  if (country === undefined) return undefined;
  const normalized = country.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(normalized)) {
    throw new ToolError({
      code: "INVALID_INPUT",
      message: "country inválido. Use código ISO alfa-2 como BR ou US.",
      technicalDetails: `country=${country}`,
    });
  }
  return normalized;
}

export function createToolCallHandler(deps: ToolDependencies) {
  return async (req: CallToolRequest): Promise<ToolResponse> => {
    switch (req.params.name) {
      case "avd_run_and_screenshot": {
        return runTool("avd_run_and_screenshot", req.params.arguments, async () => {
          const {
            avdName,
            serial,
            command,
            coldBoot,
            wipeData,
            noWindow,
            readOnly,
            gpuMode,
            waitMsAfterRun,
          } = await parseToolArguments(
            runAndScreenshotSchema,
            req.params.arguments,
            "avd_run_and_screenshot"
          );

          assertSafeCliCommand(command, "command");

          const result = await deps.runAndScreenshotUseCase.execute({
            ...(avdName ? { avdName } : {}),
            ...(serial ? { serial } : {}),
            command,
            coldBoot,
            wipeData,
            noWindow,
            readOnly,
            ...(gpuMode ? { gpuMode } : {}),
            waitMsAfterRun,
          });

          return {
            content: [
              {
                type: "text",
                text: `CMD: ${result.command}\n\nSTDOUT:\n${result.stdout}\n\nSTDERR:\n${result.stderr}`,
              },
              {
                type: "image",
                data: result.screenshotPng.toString("base64"),
                mimeType: "image/png",
              },
            ],
          };
        });
      }

      case "avd_list": {
        return runTool("avd_list", req.params.arguments, async () => {
          const avds = await deps.listAvdsUseCase.execute();
          return {
            content: [
              {
                type: "text",
                text: avds.length
                  ? `AVDs disponíveis (${avds.length}):\n- ${avds.join("\n- ")}`
                  : "Nenhum AVD encontrado na máquina.",
              },
            ],
          };
        });
      }

      case "avd_start": {
        return runTool("avd_start", req.params.arguments, async () => {
          const {
            avdName,
            coldBoot,
            wipeData,
            noWindow,
            readOnly,
            gpuMode,
            waitForBoot,
          } = await parseToolArguments(startAvdSchema, req.params.arguments, "avd_start");

          const result = await deps.startAvdUseCase.execute({
            ...(avdName ? { avdName } : {}),
            coldBoot,
            wipeData,
            noWindow,
            readOnly,
            ...(gpuMode ? { gpuMode } : {}),
            waitForBoot,
          });

          return {
            content: [
              {
                type: "text",
                text:
                  result.status === "already-online"
                    ? `Já existe device online: ${result.onlineDevices.join(", ")}`
                    : `AVD iniciado: ${result.selectedAvd}\nDevices online: ${result.onlineDevices.join(", ") || "(aguardando boot)"}`,
              },
            ],
          };
        });
      }

      case "avd_stop": {
        return runTool("avd_stop", req.params.arguments, async () => {
          const { serial } = await parseToolArguments(stopAvdSchema, req.params.arguments, "avd_stop");
          const result = await deps.stopAvdUseCase.execute(serial);

          return {
            content: [
              {
                type: "text",
                text: `Emulador encerrado: ${result.stoppedSerial}\nDevices online após stop: ${result.onlineDevicesAfterStop.join(", ") || "nenhum"}`,
              },
            ],
          };
        });
      }

      case "avd_status": {
        return runTool("avd_status", req.params.arguments, async () => {
          const { serial } = await parseToolArguments(avdStatusSchema, req.params.arguments, "avd_status");
          const result = await deps.avdStatusUseCase.execute(serial);

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        });
      }

      case "avd_restart": {
        return runTool("avd_restart", req.params.arguments, async () => {
          const {
            serial,
            coldBoot,
            wipeData,
            noWindow,
            readOnly,
            gpuMode,
            waitForBoot,
          } = await parseToolArguments(avdRestartSchema, req.params.arguments, "avd_restart");

          const result = await deps.avdRestartUseCase.execute({
            ...(serial ? { serial } : {}),
            coldBoot,
            wipeData,
            noWindow,
            readOnly,
            ...(gpuMode ? { gpuMode } : {}),
            waitForBoot,
          });

          logInfo({
            traceId: result.traceId,
            tool: "avd_restart",
            message: "avd_restart_completed",
            data: {
              deviceId: result.targetSerial,
              success: true,
              durationMs: result.totalDurationMs,
              targetSerial: result.targetSerial,
              avdName: result.avdName,
              stopDurationMs: result.stopDurationMs,
              startDurationMs: result.startDurationMs,
              totalDurationMs: result.totalDurationMs,
            },
          });

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        });
      }

      case "adb_install_apk": {
        return runTool("adb_install_apk", req.params.arguments, async () => {
          const { serial, apkPath, timeoutMs } = await parseToolArguments(
            adbInstallApkSchema,
            req.params.arguments,
            "adb_install_apk"
          );

          assertPathInsideWorkspace(apkPath, "apkPath");

          const result = await deps.adbRunner.runAdbCommand({
            ...(serial ? { serial } : {}),
            args: ["install", "-r", apkPath],
            timeoutMs,
          });

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    tool: "adb_install_apk",
                    serial: serial ?? null,
                    apkPath,
                    stdout: result.stdout,
                    stderr: result.stderr,
                    exitCode: result.exitCode,
                    durationMs: result.durationMs,
                  },
                  null,
                  2
                ),
              },
            ],
          };
        });
      }

      case "adb_uninstall": {
        return runTool("adb_uninstall", req.params.arguments, async () => {
          const { serial, packageName, timeoutMs } = await parseToolArguments(
            adbUninstallSchema,
            req.params.arguments,
            "adb_uninstall"
          );

          const result = await deps.adbRunner.runAdbCommand({
            ...(serial ? { serial } : {}),
            args: ["uninstall", packageName],
            timeoutMs,
          });

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    tool: "adb_uninstall",
                    serial: serial ?? null,
                    packageName,
                    stdout: result.stdout,
                    stderr: result.stderr,
                    exitCode: result.exitCode,
                    durationMs: result.durationMs,
                  },
                  null,
                  2
                ),
              },
            ],
          };
        });
      }

      case "adb_shell": {
        return runTool("adb_shell", req.params.arguments, async () => {
          const { serial, command, timeoutMs } = await parseToolArguments(
            adbShellSchema,
            req.params.arguments,
            "adb_shell"
          );

          assertSafeCliCommand(command, "command");
          assertSafeAdbShellCommand(command);

          const result = await deps.adbRunner.runAdbCommand({
            ...(serial ? { serial } : {}),
            args: ["shell", command],
            timeoutMs,
          });

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    tool: "adb_shell",
                    serial: serial ?? null,
                    command,
                    stdout: result.stdout,
                    stderr: result.stderr,
                    exitCode: result.exitCode,
                    durationMs: result.durationMs,
                  },
                  null,
                  2
                ),
              },
            ],
          };
        });
      }

      case "adb_logcat": {
        return runTool("adb_logcat", req.params.arguments, async () => {
          const { serial, filter, maxLines, timeoutMs } = await parseToolArguments(
            adbLogcatSchema,
            req.params.arguments,
            "adb_logcat"
          );

          const args = ["logcat", ...(filter ? [filter] : [])];
          const result = await deps.adbRunner.runAdbCommand({
            ...(serial ? { serial } : {}),
            args,
            timeoutMs,
          });

          const lines = result.stdout
            .split(/\r?\n/)
            .filter((line) => line.trim().length > 0)
            .slice(-maxLines);

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    tool: "adb_logcat",
                    serial: serial ?? null,
                    filter: filter ?? null,
                    maxLines,
                    stdout: lines.join("\n"),
                    stderr: result.stderr,
                    exitCode: result.exitCode,
                    durationMs: result.durationMs,
                  },
                  null,
                  2
                ),
              },
            ],
          };
        });
      }

      case "app_launch": {
        return runTool("app_launch", req.params.arguments, async () => {
          const { serial, packageName, activity, timeoutMs } = await parseToolArguments(
            appLaunchSchema,
            req.params.arguments,
            "app_launch"
          );

          assertSafePackageName(packageName);
          if (activity) {
            assertSafeActivity(activity);
          }

          const args = activity
            ? ["shell", "am", "start", "-n", `${packageName}/${activity}`]
            : ["shell", "monkey", "-p", packageName, "-c", "android.intent.category.LAUNCHER", "1"];

          const result = await deps.adbRunner.runAdbCommand({
            ...(serial ? { serial } : {}),
            args,
            timeoutMs,
          });

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    tool: "app_launch",
                    serial: serial ?? null,
                    packageName,
                    activity: activity ?? null,
                    launchMode: activity ? "am_start" : "monkey",
                    stdout: result.stdout,
                    stderr: result.stderr,
                    exitCode: result.exitCode,
                    durationMs: result.durationMs,
                  },
                  null,
                  2
                ),
              },
            ],
          };
        });
      }

      case "app_force_stop": {
        return runTool("app_force_stop", req.params.arguments, async () => {
          const { serial, packageName, timeoutMs } = await parseToolArguments(
            appForceStopSchema,
            req.params.arguments,
            "app_force_stop"
          );

          assertSafePackageName(packageName);

          const result = await deps.adbRunner.runAdbCommand({
            ...(serial ? { serial } : {}),
            args: ["shell", "am", "force-stop", packageName],
            timeoutMs,
          });

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    tool: "app_force_stop",
                    serial: serial ?? null,
                    packageName,
                    stdout: result.stdout,
                    stderr: result.stderr,
                    exitCode: result.exitCode,
                    durationMs: result.durationMs,
                  },
                  null,
                  2
                ),
              },
            ],
          };
        });
      }

      case "open_deeplink": {
        return runTool("open_deeplink", req.params.arguments, async () => {
          const { serial, uri, packageName, timeoutMs } = await parseToolArguments(
            openDeeplinkSchema,
            req.params.arguments,
            "open_deeplink"
          );

          assertSafeUri(uri);
          if (packageName) {
            assertSafePackageName(packageName);
          }

          const args = [
            "shell",
            "am",
            "start",
            "-a",
            "android.intent.action.VIEW",
            "-d",
            uri,
            ...(packageName ? ["-p", packageName] : []),
          ];

          const result = await deps.adbRunner.runAdbCommand({
            ...(serial ? { serial } : {}),
            args,
            timeoutMs,
          });

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    tool: "open_deeplink",
                    serial: serial ?? null,
                    uri,
                    packageName: packageName ?? null,
                    stdout: result.stdout,
                    stderr: result.stderr,
                    exitCode: result.exitCode,
                    durationMs: result.durationMs,
                  },
                  null,
                  2
                ),
              },
            ],
          };
        });
      }

      case "grant_permissions": {
        return runTool("grant_permissions", req.params.arguments, async () => {
          const {
            serial,
            packageName,
            permissions,
            timeoutMsPerPermission,
          } = await parseToolArguments(grantPermissionsSchema, req.params.arguments, "grant_permissions");

          assertSafePackageName(packageName);
          assertSafePermissions(permissions);

          const operations: Array<{
            permission: string;
            success: boolean;
            exitCode: number;
            stdout: string;
            stderr: string;
            durationMs: number;
          }> = [];

          for (const permission of permissions) {
            const op = await deps.adbRunner.runAdbCommand({
              ...(serial ? { serial } : {}),
              args: ["shell", "pm", "grant", packageName, permission],
              timeoutMs: timeoutMsPerPermission,
            });

            operations.push({
              permission,
              success: op.exitCode === 0,
              exitCode: op.exitCode,
              stdout: op.stdout,
              stderr: op.stderr,
              durationMs: op.durationMs,
            });
          }

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    tool: "grant_permissions",
                    serial: serial ?? null,
                    packageName,
                    overallSuccess: operations.every((item) => item.success),
                    operations,
                  },
                  null,
                  2
                ),
              },
            ],
          };
        });
      }

      case "clear_app_data": {
        return runTool("clear_app_data", req.params.arguments, async () => {
          const { serial, packageName, timeoutMs } = await parseToolArguments(
            clearAppDataSchema,
            req.params.arguments,
            "clear_app_data"
          );

          assertSafePackageName(packageName);

          const result = await deps.adbRunner.runAdbCommand({
            ...(serial ? { serial } : {}),
            args: ["shell", "pm", "clear", packageName],
            timeoutMs,
          });

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    tool: "clear_app_data",
                    serial: serial ?? null,
                    packageName,
                    stdout: result.stdout,
                    stderr: result.stderr,
                    exitCode: result.exitCode,
                    durationMs: result.durationMs,
                  },
                  null,
                  2
                ),
              },
            ],
          };
        });
      }

      case "screenrecord_start": {
        return runTool("screenrecord_start", req.params.arguments, async () => {
          const { serial, maxDurationSeconds, bitRate, size } = await parseToolArguments(
            screenrecordStartSchema,
            req.params.arguments,
            "screenrecord_start"
          );

          const result = await deps.screenrecordSessionManager.start({
            ...(serial ? { serial } : {}),
            maxDurationSeconds,
            ...(bitRate ? { bitRate } : {}),
            ...(size ? { size } : {}),
          });

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        });
      }

      case "screenrecord_stop": {
        return runTool("screenrecord_stop", req.params.arguments, async () => {
          const { serial, sessionId, inlineBase64 } = await parseToolArguments(
            screenrecordStopSchema,
            req.params.arguments,
            "screenrecord_stop"
          );

          const result = await deps.screenrecordSessionManager.stop({
            ...(serial ? { serial } : {}),
            sessionId,
            inlineBase64: inlineBase64 ?? deps.mediaConfig.inlineBase64ByDefault,
          });

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        });
      }

      case "screenshot": {
        return runTool("screenshot", req.params.arguments, async () => {
          const { serial, crop, compressQuality, annotate, inlineBase64 } = await parseToolArguments(
            screenshotSchema,
            req.params.arguments,
            "screenshot"
          );

          const result = await deps.screenshotService.capture({
            ...(serial ? { serial } : {}),
            ...(crop ? { crop } : {}),
            ...(compressQuality !== undefined ? { compressQuality } : {}),
            ...(annotate ? { annotate } : {}),
            inlineBase64: inlineBase64 ?? deps.mediaConfig.inlineBase64ByDefault,
          });

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        });
      }

      case "network_toggle": {
        return runTool("network_toggle", req.params.arguments, async () => {
          const { serial, wifiEnabled, dataEnabled, airplaneMode } = await parseToolArguments(
            networkToggleSchema,
            req.params.arguments,
            "network_toggle"
          );

          const operations = await applyNetworkToggle(deps.adbRunner, serial, {
            wifiEnabled,
            ...(dataEnabled !== undefined ? { dataEnabled } : {}),
            ...(airplaneMode !== undefined ? { airplaneMode } : {}),
          });

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    tool: "network_toggle",
                    serial: serial ?? null,
                    requested: { wifiEnabled, dataEnabled: dataEnabled ?? null, airplaneMode: airplaneMode ?? null },
                    overallSuccess: operations.every((operation) => operation.exitCode === 0),
                    operations,
                  },
                  null,
                  2
                ),
              },
            ],
          };
        });
      }

      case "network_condition": {
        return runTool("network_condition", req.params.arguments, async () => {
          const { serial, profile } = await parseToolArguments(
            networkConditionSchema,
            req.params.arguments,
            "network_condition"
          );

          const operations: AdbOperationOutput[] = [];
          const warnings: string[] = [];

          if (typeof profile === "string") {
            const preset = NETWORK_PROFILE_PRESETS[profile];
            operations.push(await runAdbOperation(deps.adbRunner, serial, ["emu", "network", "delay", preset.delay]));
            operations.push(await runAdbOperation(deps.adbRunner, serial, ["emu", "network", "speed", preset.speed]));

            if (preset.toggle) {
              const toggleOps = await applyNetworkToggle(deps.adbRunner, serial, preset.toggle);
              operations.push(...toggleOps);
            }

            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(
                    {
                      tool: "network_condition",
                      serial: serial ?? null,
                      profile,
                      applied: {
                        delay: preset.delay,
                        speed: preset.speed,
                        ...(preset.toggle ? { toggle: preset.toggle } : {}),
                      },
                      overallSuccess: operations.every((operation) => operation.exitCode === 0),
                      operations,
                    },
                    null,
                    2
                  ),
                },
              ],
            };
          }

          if (profile.latencyMs !== undefined) {
            if (!Number.isFinite(profile.latencyMs) || profile.latencyMs < 0 || profile.latencyMs > 4_000) {
              throw new ToolError({
                code: "INVALID_INPUT",
                message: "latencyMs deve estar entre 0 e 4000.",
                technicalDetails: `latencyMs=${profile.latencyMs}`,
              });
            }

            operations.push(
              await runAdbOperation(deps.adbRunner, serial, ["emu", "network", "delay", String(Math.round(profile.latencyMs))])
            );
          }

          if (profile.speedKbps !== undefined) {
            if (!Number.isFinite(profile.speedKbps) || profile.speedKbps <= 0) {
              throw new ToolError({
                code: "INVALID_INPUT",
                message: "speedKbps deve ser maior que zero.",
                technicalDetails: `speedKbps=${profile.speedKbps}`,
              });
            }

            const speedProfile = mapSpeedKbpsToProfile(profile.speedKbps);
            operations.push(await runAdbOperation(deps.adbRunner, serial, ["emu", "network", "speed", speedProfile]));
          }

          if (profile.packetLoss !== undefined) {
            if (!Number.isFinite(profile.packetLoss) || profile.packetLoss < 0 || profile.packetLoss > 100) {
              throw new ToolError({
                code: "INVALID_INPUT",
                message: "packetLoss deve estar entre 0 e 100.",
                technicalDetails: `packetLoss=${profile.packetLoss}`,
              });
            }

            warnings.push("packetLoss foi solicitado, mas adb emu não expõe comando estável para perda de pacote; valor não aplicado automaticamente.");
          }

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    tool: "network_condition",
                    serial: serial ?? null,
                    profile,
                    overallSuccess: operations.every((operation) => operation.exitCode === 0),
                    operations,
                    warnings,
                  },
                  null,
                  2
                ),
              },
            ],
          };
        });
      }

      case "set_location": {
        return runTool("set_location", req.params.arguments, async () => {
          const { serial, latitude, longitude } = await parseToolArguments(
            setLocationSchema,
            req.params.arguments,
            "set_location"
          );

          if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
            throw new ToolError({
              code: "INVALID_INPUT",
              message: "latitude deve estar entre -90 e 90.",
              technicalDetails: `latitude=${latitude}`,
            });
          }

          if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
            throw new ToolError({
              code: "INVALID_INPUT",
              message: "longitude deve estar entre -180 e 180.",
              technicalDetails: `longitude=${longitude}`,
            });
          }

          const operation = await runAdbOperation(deps.adbRunner, serial, [
            "emu",
            "geo",
            "fix",
            String(longitude),
            String(latitude),
          ]);

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    tool: "set_location",
                    serial: serial ?? null,
                    latitude,
                    longitude,
                    success: operation.exitCode === 0,
                    operation,
                  },
                  null,
                  2
                ),
              },
            ],
          };
        });
      }

      case "set_battery_state": {
        return runTool("set_battery_state", req.params.arguments, async () => {
          const { serial, level, charging } = await parseToolArguments(
            setBatteryStateSchema,
            req.params.arguments,
            "set_battery_state"
          );

          if (level === undefined && charging === undefined) {
            throw new ToolError({
              code: "INVALID_INPUT",
              message: "Informe ao menos level ou charging.",
            });
          }

          if (level !== undefined && (!Number.isFinite(level) || level < 0 || level > 100)) {
            throw new ToolError({
              code: "INVALID_INPUT",
              message: "level deve estar entre 0 e 100.",
              technicalDetails: `level=${level}`,
            });
          }

          const operations: AdbOperationOutput[] = [];

          if (level !== undefined) {
            operations.push(
              await runAdbOperation(deps.adbRunner, serial, [
                "shell",
                "dumpsys",
                "battery",
                "set",
                "level",
                String(Math.round(level)),
              ])
            );
          }

          if (charging !== undefined) {
            operations.push(
              await runAdbOperation(deps.adbRunner, serial, [
                "shell",
                "dumpsys",
                "battery",
                "set",
                "status",
                charging ? "2" : "3",
              ])
            );
            operations.push(
              await runAdbOperation(deps.adbRunner, serial, [
                "shell",
                "dumpsys",
                "battery",
                "set",
                "plugged",
                charging ? "1" : "0",
              ])
            );
          }

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    tool: "set_battery_state",
                    serial: serial ?? null,
                    requested: {
                      level: level ?? null,
                      charging: charging ?? null,
                    },
                    overallSuccess: operations.every((operation) => operation.exitCode === 0),
                    operations,
                  },
                  null,
                  2
                ),
              },
            ],
          };
        });
      }

      case "set_rotation": {
        return runTool("set_rotation", req.params.arguments, async () => {
          const { serial, orientation } = await parseToolArguments(
            setRotationSchema,
            req.params.arguments,
            "set_rotation"
          );

          const userRotation = orientation === "portrait" ? "0" : "1";
          const operations: AdbOperationOutput[] = [];

          operations.push(
            await runAdbOperation(deps.adbRunner, serial, [
              "shell",
              "settings",
              "put",
              "system",
              "accelerometer_rotation",
              "0",
            ])
          );

          operations.push(
            await runAdbOperation(deps.adbRunner, serial, [
              "shell",
              "settings",
              "put",
              "system",
              "user_rotation",
              userRotation,
            ])
          );

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    tool: "set_rotation",
                    serial: serial ?? null,
                    orientation,
                    userRotation: Number(userRotation),
                    overallSuccess: operations.every((operation) => operation.exitCode === 0),
                    operations,
                  },
                  null,
                  2
                ),
              },
            ],
          };
        });
      }

      case "set_locale": {
        return runTool("set_locale", req.params.arguments, async () => {
          const { serial, language, country } = await parseToolArguments(
            setLocaleSchema,
            req.params.arguments,
            "set_locale"
          );

          const normalizedLanguage = normalizeLanguage(language);
          const normalizedCountry = normalizeCountry(country);
          const localeTag = normalizedCountry
            ? `${normalizedLanguage}-${normalizedCountry}`
            : normalizedLanguage;

          const operations: AdbOperationOutput[] = [];
          operations.push(
            await runAdbOperation(deps.adbRunner, serial, [
              "shell",
              "setprop",
              "persist.sys.locale",
              localeTag,
            ])
          );

          operations.push(
            await runAdbOperation(deps.adbRunner, serial, [
              "shell",
              "setprop",
              "persist.sys.language",
              normalizedLanguage,
            ])
          );

          if (normalizedCountry) {
            operations.push(
              await runAdbOperation(deps.adbRunner, serial, [
                "shell",
                "setprop",
                "persist.sys.country",
                normalizedCountry,
              ])
            );
          }

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    tool: "set_locale",
                    serial: serial ?? null,
                    locale: localeTag,
                    requiresRebootOrAppRestart: true,
                    overallSuccess: operations.every((operation) => operation.exitCode === 0),
                    operations,
                  },
                  null,
                  2
                ),
              },
            ],
          };
        });
      }

      case "get_metrics": {
        return runTool("get_metrics", req.params.arguments, async () => {
          await parseToolArguments(getMetricsSchema, req.params.arguments, "get_metrics");
          const metrics = getMetricsSnapshot();
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(metrics, null, 2),
              },
            ],
          };
        });
      }

      default:
        throw new ToolError({
          code: "UNKNOWN_TOOL",
          message: `Tool desconhecida: ${req.params.name}`,
          technicalDetails: `name=${req.params.name}`,
        });
    }
  };
}
