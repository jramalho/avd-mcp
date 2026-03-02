#!/usr/bin/env node

import { z } from "zod";

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { ListAvdsUseCase } from "./application/list-avds-use-case.js";
import { RunAndScreenshotUseCase } from "./application/run-and-screenshot-use-case.js";
import { StartAvdUseCase } from "./application/start-avd-use-case.js";
import { StopAvdUseCase } from "./application/stop-avd-use-case.js";
import { AdbAdapter } from "./adapters/node/adb-adapter.js";
import { ClockAdapter } from "./adapters/node/clock-adapter.js";
import { EmulatorAdapter } from "./adapters/node/emulator-adapter.js";
import { ExecCommandRunner } from "./adapters/node/exec-command-runner.js";
import { ScreenshotAdapter } from "./adapters/node/screenshot-adapter.js";
import { ShellAdapter } from "./adapters/node/shell-adapter.js";
import { gpuModes } from "./domain/avd.js";

const runAndScreenshotInputSchema = {
  type: "object",
  properties: {
    avdName: { type: "string" },
    command: { type: "string" },
    coldBoot: { type: "boolean", default: false },
    wipeData: { type: "boolean", default: false },
    noWindow: { type: "boolean", default: false },
    readOnly: { type: "boolean", default: false },
    gpuMode: {
      type: "string",
      enum: [...gpuModes],
    },
    waitMsAfterRun: { type: "number", default: 2000 },
  },
  required: ["command"],
} as const;

const runAndScreenshotSchema = z.object({
  avdName: z.string().optional(),
  command: z.string(),
  coldBoot: z.boolean().optional().default(false),
  wipeData: z.boolean().optional().default(false),
  noWindow: z.boolean().optional().default(false),
  readOnly: z.boolean().optional().default(false),
  gpuMode: z.enum(gpuModes).optional(),
  waitMsAfterRun: z.number().optional().default(2000),
});

const startAvdInputSchema = {
  type: "object",
  properties: {
    avdName: { type: "string" },
    coldBoot: { type: "boolean", default: false },
    wipeData: { type: "boolean", default: false },
    noWindow: { type: "boolean", default: false },
    readOnly: { type: "boolean", default: false },
    gpuMode: {
      type: "string",
      enum: [...gpuModes],
    },
    waitForBoot: { type: "boolean", default: true },
  },
  required: [],
} as const;

const startAvdSchema = z.object({
  avdName: z.string().optional(),
  coldBoot: z.boolean().optional().default(false),
  wipeData: z.boolean().optional().default(false),
  noWindow: z.boolean().optional().default(false),
  readOnly: z.boolean().optional().default(false),
  gpuMode: z.enum(gpuModes).optional(),
  waitForBoot: z.boolean().optional().default(true),
});

const stopAvdInputSchema = {
  type: "object",
  properties: {
    serial: { type: "string" },
  },
  required: [],
} as const;

const stopAvdSchema = z.object({
  serial: z.string().optional(),
});

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

const server = new Server(
  { name: "avd-mcp", version: "0.1.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "avd_run_and_screenshot",
      description:
        "Sobe AVD se necessário, roda comando (pnpm/gradle/etc) e tira screenshot.",
      inputSchema: runAndScreenshotInputSchema,
    },
    {
      name: "avd_list",
      description: "Lista os AVDs disponíveis na máquina via emulator -list-avds.",
      inputSchema: {
        type: "object",
        properties: {},
        required: [],
      },
    },
    {
      name: "avd_start",
      description: "Sobe um AVD com opções de boot (coldBoot, wipeData, noWindow, readOnly, gpuMode).",
      inputSchema: startAvdInputSchema,
    },
    {
      name: "avd_stop",
      description: "Encerra um emulador online via adb emu kill (serial opcional).",
      inputSchema: stopAvdInputSchema,
    },
  ]
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  switch (req.params.name) {
    case "avd_run_and_screenshot": {
      const {
        avdName,
        command,
        coldBoot,
        wipeData,
        noWindow,
        readOnly,
        gpuMode,
        waitMsAfterRun,
      } = runAndScreenshotSchema.parse(req.params.arguments);

      const result = await runAndScreenshotUseCase.execute({
        ...(avdName ? { avdName } : {}),
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
    }

    case "avd_list": {
      const avds = await listAvdsUseCase.execute();
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
    }

    case "avd_start": {
      const {
        avdName,
        coldBoot,
        wipeData,
        noWindow,
        readOnly,
        gpuMode,
        waitForBoot,
      } = startAvdSchema.parse(req.params.arguments);

      const result = await startAvdUseCase.execute({
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
    }

    case "avd_stop": {
      const { serial } = stopAvdSchema.parse(req.params.arguments);
      const result = await stopAvdUseCase.execute(serial);

      return {
        content: [
          {
            type: "text",
            text: `Emulador encerrado: ${result.stoppedSerial}\nDevices online após stop: ${result.onlineDevicesAfterStop.join(", ") || "nenhum"}`,
          },
        ],
      };
    }

    default:
      throw new Error("Tool desconhecida");
  }
});

await server.connect(new StdioServerTransport());
