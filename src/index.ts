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

async function adb(args: string[]) {
  return run("adb", args, 5 * 60_000);
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

async function ensureEmulator(avd?: string) {
  const devices = await adb(["devices"]);
  if (devices.stdout.includes("\tdevice")) return;

  if (!avd) throw new Error("Nenhum device online e avdName não informado.");

  // dispara o emulator (não bloqueia)
  run("emulator", ["-avd", avd, "-no-snapshot-save"], 5000).catch(() => {});

  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const chk = await adb(["devices"]);
    if (chk.stdout.includes("\tdevice")) return;
  }

  throw new Error("Timeout esperando o AVD subir.");
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
    waitMsAfterRun: z.number().optional().default(2000),
  });

  const { avdName, command, waitMsAfterRun } =
    schema.parse(req.params.arguments);

  await ensureEmulator(avdName);

  const { stdout, stderr } = await run(
    "powershell.exe",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", command],
    30 * 60_000
  ).catch((e) => ({
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
