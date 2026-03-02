#!/usr/bin/env node

import { z } from "zod";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import os from "node:os";

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const exec = promisify(execFile);

async function run(cmd: string, args: string[], timeout = 10 * 60_000) {
  const { stdout, stderr } = await exec(cmd, args, {
    timeout,
    maxBuffer: 50 * 1024 * 1024,
  });
  return { stdout: String(stdout ?? ""), stderr: String(stderr ?? "") };
}

async function runShellCommand(command: string, timeout = 30 * 60_000) {
  if (process.platform === "win32") {
    return run(
      "powershell.exe",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", command],
      timeout
    );
  }

  try {
    return await run("sh", ["-lc", command], timeout);
  } catch (error: unknown) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      try {
        return await run("bash", ["-lc", command], timeout);
      } catch (bashError: unknown) {
        if (
          typeof bashError === "object" &&
          bashError !== null &&
          "code" in bashError &&
          bashError.code === "ENOENT"
        ) {
          return run("zsh", ["-lc", command], timeout);
        }
        throw bashError;
      }
    }
    throw error;
  }
}

async function adb(args: string[]) {
  return run("adb", args, 5 * 60_000);
}

async function listAvds() {
  const { stdout } = await run("emulator", ["-list-avds"], 60_000);
  return stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

async function ensureDir(dir: string) {
  await mkdir(dir, { recursive: true });
}

async function screenshot(out: string) {
  const tmp = "/sdcard/__mcp_screen.png";
  await adb(["shell", "screencap", "-p", tmp]);
  await adb(["pull", tmp, out]);
  await adb(["shell", "rm", tmp]);
}

type EmulatorBootOptions = {
  avd?: string;
  coldBoot?: boolean;
  wipeData?: boolean;
  noWindow?: boolean;
  readOnly?: boolean;
  gpuMode?: "auto" | "host" | "swiftshader_indirect";
};

async function ensureEmulator(options: EmulatorBootOptions) {
  const {
    avd,
    coldBoot = false,
    wipeData = false,
    noWindow = false,
    readOnly = false,
    gpuMode,
  } = options;
  const devices = await adb(["devices"]);
  if (devices.stdout.includes("\tdevice")) return;

  const avds = await listAvds();
  if (!avds.length) {
    throw new Error("Nenhum AVD encontrado na máquina. Crie um AVD no Android Studio.");
  }

  if (avd && !avds.includes(avd)) {
    throw new Error(
      `avdName \"${avd}\" não encontrado. AVDs disponíveis: ${avds.join(", ")}`
    );
  }

  const selectedAvd = avd ?? avds[0]!;
  const emulatorArgs = ["-avd", selectedAvd, "-no-snapshot-save"];
  if (coldBoot) emulatorArgs.push("-no-snapshot-load");
  if (wipeData) emulatorArgs.push("-wipe-data");
  if (noWindow) emulatorArgs.push("-no-window");
  if (readOnly) emulatorArgs.push("-read-only");
  if (gpuMode) emulatorArgs.push("-gpu", gpuMode);

  // dispara o emulator (não bloqueia)
  run("emulator", emulatorArgs, 5000).catch(() => {});

  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const chk = await adb(["devices"]);
    if (chk.stdout.includes("\tdevice")) return;
  }

  throw new Error(`Timeout esperando o AVD \"${selectedAvd}\" subir.`);
}

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
      inputSchema: {
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
            enum: ["auto", "host", "swiftshader_indirect"],
          },
          waitMsAfterRun: { type: "number", default: 2000 }
        },
        required: ["command"]
      }
    }
  ]
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  if (req.params.name !== "avd_run_and_screenshot") {
    throw new Error("Tool desconhecida");
  }

  const schema = z.object({
    avdName: z.string().optional(),
    command: z.string(),
    coldBoot: z.boolean().optional().default(false),
    wipeData: z.boolean().optional().default(false),
    noWindow: z.boolean().optional().default(false),
    readOnly: z.boolean().optional().default(false),
    gpuMode: z.enum(["auto", "host", "swiftshader_indirect"]).optional(),
    waitMsAfterRun: z.number().optional().default(2000),
  });

  const {
    avdName,
    command,
    coldBoot,
    wipeData,
    noWindow,
    readOnly,
    gpuMode,
    waitMsAfterRun,
  } =
    schema.parse(req.params.arguments);

  await ensureEmulator({
    ...(avdName ? { avd: avdName } : {}),
    coldBoot,
    wipeData,
    noWindow,
    readOnly,
    ...(gpuMode ? { gpuMode } : {}),
  });

  const { stdout, stderr } = await runShellCommand(command, 30 * 60_000).catch((e) => ({
    stdout: "",
    stderr: String(e),
  }));

  await new Promise((r) => setTimeout(r, waitMsAfterRun));

  const dir = join(os.tmpdir(), "avd-mcp");
  await ensureDir(dir);
  const file = join(dir, `screen-${Date.now()}.png`);
  await screenshot(file);
  const png = await readFile(file);

  return {
    content: [
      {
        type: "text",
        text: `CMD: ${command}\n\nSTDOUT:\n${stdout}\n\nSTDERR:\n${stderr}`
      },
      {
        type: "image",
        data: png.toString("base64"),
        mimeType: "image/png"
      }
    ]
  };
});

await server.connect(new StdioServerTransport());
