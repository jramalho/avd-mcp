#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { AdbRunner } from "./adb/runner.js";
import { ListAvdsUseCase } from "./application/list-avds-use-case.js";
import {
  AvdRestartUseCase,
} from "./application/avd-restart-use-case.js";
import {
  AvdStatusUseCase,
} from "./application/avd-status-use-case.js";
import { RunAndScreenshotUseCase } from "./application/run-and-screenshot-use-case.js";
import { StartAvdUseCase } from "./application/start-avd-use-case.js";
import { StopAvdUseCase } from "./application/stop-avd-use-case.js";
import { AdbAdapter } from "./adapters/node/adb-adapter.js";
import { ClockAdapter } from "./adapters/node/clock-adapter.js";
import { EmulatorAdapter } from "./adapters/node/emulator-adapter.js";
import { ExecCommandRunner } from "./adapters/node/exec-command-runner.js";
import { ScreenshotAdapter } from "./adapters/node/screenshot-adapter.js";
import { ShellAdapter } from "./adapters/node/shell-adapter.js";
import { MediaArtifacts } from "./media/media-artifacts.js";
import { getMediaConfig } from "./media/media-config.js";
import { ScreenrecordSessionManager } from "./media/screenrecord-session-manager.js";
import { ScreenshotService } from "./media/screenshot-service.js";
import { toolDefinitions } from "./mcp/tools/definitions.js";
import { createToolCallHandler } from "./mcp/tools/handler.js";

const adbRunner = new AdbRunner();
const mediaConfig = getMediaConfig();
const mediaArtifacts = new MediaArtifacts(mediaConfig.artifactsRootDir);
const screenrecordSessionManager = new ScreenrecordSessionManager(adbRunner, mediaArtifacts);
const screenshotService = new ScreenshotService(adbRunner, mediaArtifacts);

const commandRunner = new ExecCommandRunner();
const adbAdapter = new AdbAdapter(commandRunner);
const clockAdapter = new ClockAdapter();
const emulatorAdapter = new EmulatorAdapter(commandRunner);

const runAndScreenshotUseCase = new RunAndScreenshotUseCase(
  adbAdapter,
  emulatorAdapter,
  new ShellAdapter(commandRunner),
  new ScreenshotAdapter(commandRunner),
  clockAdapter
);
const listAvdsUseCase = new ListAvdsUseCase(emulatorAdapter);
const startAvdUseCase = new StartAvdUseCase(adbAdapter, emulatorAdapter, clockAdapter);
const stopAvdUseCase = new StopAvdUseCase(adbAdapter, clockAdapter);
const avdStatusUseCase = new AvdStatusUseCase(adbAdapter);
const avdRestartUseCase = new AvdRestartUseCase(adbAdapter, clockAdapter, startAvdUseCase);

const server = new Server(
  { name: "avd-mcp", version: "0.1.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: toolDefinitions
}));

server.setRequestHandler(
  CallToolRequestSchema,
  createToolCallHandler({
    listAvdsUseCase,
    runAndScreenshotUseCase,
    startAvdUseCase,
    stopAvdUseCase,
    avdStatusUseCase,
    avdRestartUseCase,
    adbRunner,
    screenrecordSessionManager,
    screenshotService,
    mediaConfig,
  })
);

await server.connect(new StdioServerTransport());
