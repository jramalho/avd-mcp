import { randomUUID } from "node:crypto";

import { z } from "zod";

import type { CallToolRequest } from "@modelcontextprotocol/sdk/types.js";
import type { AdbRunner } from "../../adb/runner.js";
import {
  assertSafeActivity,
  assertSafePackageName,
  assertSafePermissions,
  assertSafeUri,
} from "../../adb/app-validators.js";
import { assertSafeAdbShellCommand } from "../../adb/shell-safety.js";
import type { AvdRestartUseCase } from "../../application/avd-restart-use-case.js";
import type { AvdStatusUseCase } from "../../application/avd-status-use-case.js";
import type { ListAvdsUseCase } from "../../application/list-avds-use-case.js";
import type { RunAndScreenshotUseCase } from "../../application/run-and-screenshot-use-case.js";
import type { StartAvdUseCase } from "../../application/start-avd-use-case.js";
import type { StopAvdUseCase } from "../../application/stop-avd-use-case.js";
import { ToolError, toToolError } from "../../shared/errors/tool-error.js";
import type { Logger } from "../../shared/logging/logger.js";
import {
  adbInstallApkSchema,
  adbLogcatSchema,
  adbShellSchema,
  adbUninstallSchema,
  appForceStopSchema,
  appLaunchSchema,
  clearAppDataSchema,
  avdRestartSchema,
  avdStatusSchema,
  grantPermissionsSchema,
  openDeeplinkSchema,
  runAndScreenshotSchema,
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
  logger: Logger;
  listAvdsUseCase: ListAvdsUseCase;
  runAndScreenshotUseCase: RunAndScreenshotUseCase;
  startAvdUseCase: StartAvdUseCase;
  stopAvdUseCase: StopAvdUseCase;
  avdStatusUseCase: AvdStatusUseCase;
  avdRestartUseCase: AvdRestartUseCase;
  adbRunner: AdbRunner;
};

function formatToolErrorText(error: ToolError) {
  const technical = error.technicalDetails ?? "n/a";
  return `Erro: ${error.message}\nCódigo: ${error.code}\nDetalhes técnicos: ${technical}`;
}

async function parseToolArguments<TSchema extends z.ZodTypeAny>(
  schema: TSchema,
  args: unknown,
  toolName: string
): Promise<z.output<TSchema>> {
  const parsed = await schema.safeParseAsync(args ?? {});
  if (parsed.success) return parsed.data;

  throw new ToolError({
    code: "INVALID_INPUT",
    message: `Parâmetros inválidos para ${toolName}.`,
    technicalDetails: parsed.error.flatten().formErrors.join(" | "),
    cause: parsed.error,
  });
}

async function runTool(
  logger: Logger,
  toolName: string,
  operation: () => Promise<ToolResponse>
): Promise<ToolResponse> {
  const traceId = randomUUID();
  const startedAt = Date.now();
  logger.info("tool_call_started", { tool: toolName, traceId });

  try {
    const result = await operation();
    logger.info("tool_call_succeeded", {
      tool: toolName,
      traceId,
      durationMs: Date.now() - startedAt,
    });
    return result;
  } catch (error: unknown) {
    const toolError = toToolError(error, `Falha ao executar ${toolName}.`);
    logger.error("tool_call_failed", {
      tool: toolName,
      traceId,
      durationMs: Date.now() - startedAt,
      code: toolError.code,
      message: toolError.message,
      technicalDetails: toolError.technicalDetails,
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

export function createToolCallHandler(deps: ToolDependencies) {
  return async (req: CallToolRequest): Promise<ToolResponse> => {
    switch (req.params.name) {
      case "avd_run_and_screenshot": {
        return runTool(deps.logger, "avd_run_and_screenshot", async () => {
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
        return runTool(deps.logger, "avd_list", async () => {
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
        return runTool(deps.logger, "avd_start", async () => {
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
        return runTool(deps.logger, "avd_stop", async () => {
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
        return runTool(deps.logger, "avd_status", async () => {
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
        return runTool(deps.logger, "avd_restart", async () => {
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

          deps.logger.info("avd_restart_completed", {
            tool: "avd_restart",
            traceId: result.traceId,
            targetSerial: result.targetSerial,
            avdName: result.avdName,
            stopDurationMs: result.stopDurationMs,
            startDurationMs: result.startDurationMs,
            totalDurationMs: result.totalDurationMs,
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
        return runTool(deps.logger, "adb_install_apk", async () => {
          const { serial, apkPath, timeoutMs } = await parseToolArguments(
            adbInstallApkSchema,
            req.params.arguments,
            "adb_install_apk"
          );

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
                    ...result,
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
        return runTool(deps.logger, "adb_uninstall", async () => {
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
                    ...result,
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
        return runTool(deps.logger, "adb_shell", async () => {
          const { serial, command, timeoutMs } = await parseToolArguments(
            adbShellSchema,
            req.params.arguments,
            "adb_shell"
          );

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
                    ...result,
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
        return runTool(deps.logger, "adb_logcat", async () => {
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
        return runTool(deps.logger, "app_launch", async () => {
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
                    ...result,
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
        return runTool(deps.logger, "app_force_stop", async () => {
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
                    ...result,
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
        return runTool(deps.logger, "open_deeplink", async () => {
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
                    ...result,
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
        return runTool(deps.logger, "grant_permissions", async () => {
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
        return runTool(deps.logger, "clear_app_data", async () => {
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
                    ...result,
                  },
                  null,
                  2
                ),
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
