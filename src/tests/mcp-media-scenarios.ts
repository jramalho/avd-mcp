import { access } from "node:fs/promises";
import { strict as assert } from "node:assert";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

type TextContent = { type: "text"; text: string };
type ToolCallWithContent = {
  content: Array<{ type: string; text?: string }>;
};

type ScenarioResult = {
  name: string;
  passed: boolean;
  details: string;
};

type ScreenrecordStartResponse = {
  sessionId?: string;
  serial?: string;
  remotePath?: string;
  startedAt?: string;
};

type ScreenrecordStopResponse = {
  sessionId?: string;
  serial?: string;
  localPath?: string;
  inlineBase64?: string;
  durationMs?: number;
};

type ScreenshotResponse = {
  traceId?: string;
  localPath?: string;
  width?: number;
  height?: number;
  inlineBase64?: string;
};

function getChildEnv(): Record<string, string> {
  return Object.entries(process.env).reduce<Record<string, string>>((acc, [key, value]) => {
    if (typeof value === "string") {
      acc[key] = value;
    }
    return acc;
  }, {});
}

function getToolContent(result: unknown): ToolCallWithContent {
  if (
    typeof result === "object" &&
    result !== null &&
    "content" in result &&
    Array.isArray((result as { content?: unknown }).content)
  ) {
    return result as ToolCallWithContent;
  }

  throw new Error("Resultado de tool sem campo content.");
}

function findTextContent(items: Array<{ type: string; text?: string }>): TextContent | undefined {
  return items.find(
    (item): item is TextContent => item.type === "text" && typeof item.text === "string"
  );
}

async function callToolText(
  client: Client,
  name: string,
  args: Record<string, unknown>
): Promise<string> {
  const result = await client.callTool({ name, arguments: args });
  const content = getToolContent(result).content;
  const textItem = findTextContent(content);
  assert.ok(textItem, `${name} deve retornar conteúdo de texto`);
  return textItem.text;
}

function extractAvdNames(listText: string): string[] {
  return listText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- "))
    .map((line) => line.slice(2).trim())
    .filter((line) => line.length > 0);
}

function extractEmulatorSerials(text: string): string[] {
  return [...text.matchAll(/emulator-\d+/g)].map((match) => match[0]);
}

function parseJsonSafe<T>(text: string): T | undefined {
  try {
    return JSON.parse(text) as T;
  } catch {
    return undefined;
  }
}

function isMissingEmulatorBinary(text: string): boolean {
  return (
    text.includes("Código: UNEXPECTED_ERROR") &&
    text.toLowerCase().includes("spawn emulator enoent")
  );
}

function hasValidTraceFileName(localPath: string, traceId: string): boolean {
  const escapedTrace = traceId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const rx = new RegExp(`\\d+_${escapedTrace}\\.png$`);
  const normalized = localPath.replace(/\\/g, "/");
  return rx.test(normalized);
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function ensureOnlineSerial(client: Client): Promise<{ serial: string; startedByRunner: boolean }> {
  const statusText = await callToolText(client, "avd_status", {});
  const status = parseJsonSafe<{
    devices?: Array<{ serial: string; state: string; isEmulator: boolean }>;
  }>(statusText);

  const online = status?.devices?.find((device) => device.state === "device" && device.isEmulator);
  if (online?.serial) {
    return { serial: online.serial, startedByRunner: false };
  }

  const listText = await callToolText(client, "avd_list", {});
  if (isMissingEmulatorBinary(listText)) {
    throw new Error("MCP media scenarios skipped: emulator binary not available in PATH.");
  }

  const avdNames = extractAvdNames(listText);
  if (avdNames.length === 0) {
    throw new Error("Nenhum AVD disponível para cenário de mídia.");
  }

  const startText = await callToolText(client, "avd_start", {
    avdName: avdNames[0],
    noWindow: true,
    gpuMode: "swiftshader_indirect",
    waitForBoot: true,
  });

  const serial = extractEmulatorSerials(startText)[0];
  if (!serial) {
    throw new Error(`Falha ao descobrir serial após avd_start: ${startText}`);
  }

  return { serial, startedByRunner: true };
}

async function run() {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ["dist/index.js"],
    cwd: process.cwd(),
    env: getChildEnv(),
    stderr: "pipe",
  });

  if (transport.stderr) {
    transport.stderr.on("data", (chunk) => {
      const line = String(chunk ?? "").trim();
      if (line.length > 0) {
        console.error(`[mcp-server-stderr] ${line}`);
      }
    });
  }

  const client = new Client(
    { name: "avd-mcp-media-scenarios", version: "0.1.0" },
    { capabilities: {} }
  );

  const results: ScenarioResult[] = [];
  let serial = "";
  let startedByRunner = false;
  let activeSessionId: string | undefined;

  try {
    await client.connect(transport);

    const online = await ensureOnlineSerial(client);
    serial = online.serial;
    startedByRunner = online.startedByRunner;

    const startText = await callToolText(client, "screenrecord_start", {
      serial,
      maxDurationSeconds: 45,
      bitRate: 4_000_000,
      size: "1280x720",
    });
    const start = parseJsonSafe<ScreenrecordStartResponse>(startText);

    activeSessionId = start?.sessionId;
    const startOk = Boolean(start?.sessionId && start?.serial === serial);
    results.push({
      name: "screenrecord_start",
      passed: startOk,
      details: startOk
        ? `sessionId=${start?.sessionId}, serial=${start?.serial}`
        : `Resposta inválida: ${startText.slice(0, 200)}`,
    });

    await callToolText(client, "adb_shell", {
      serial,
      command: "input keyevent 3",
      timeoutMs: 15000,
    });
    await sleep(2000);

    const screenshot1Text = await callToolText(client, "screenshot", {
      serial,
      inlineBase64: false,
    });
    const screenshot1 = parseJsonSafe<ScreenshotResponse>(screenshot1Text);
    const screenshot1Exists = screenshot1?.localPath ? await fileExists(screenshot1.localPath) : false;
    const screenshot1NameOk = Boolean(
      screenshot1?.localPath && screenshot1?.traceId && hasValidTraceFileName(screenshot1.localPath, screenshot1.traceId)
    );
    results.push({
      name: "screenshot padrão",
      passed: Boolean(screenshot1Exists && screenshot1NameOk),
      details: screenshot1?.localPath
        ? `path=${screenshot1.localPath}, traceId=${screenshot1.traceId}`
        : `Resposta inválida: ${screenshot1Text.slice(0, 200)}`,
    });

    const screenshot2Text = await callToolText(client, "screenshot", {
      serial,
      crop: { x: 60, y: 120, width: 600, height: 900 },
      compressQuality: 80,
      annotate: [
        { text: "Passo 2", x: 80, y: 160 },
        { text: "Validação", x: 80, y: 220 },
      ],
      inlineBase64: false,
    });
    const screenshot2 = parseJsonSafe<ScreenshotResponse>(screenshot2Text);
    const screenshot2Exists = screenshot2?.localPath ? await fileExists(screenshot2.localPath) : false;
    const screenshot2SizeOk = (screenshot2?.width ?? 0) > 0 && (screenshot2?.height ?? 0) > 0;
    results.push({
      name: "screenshot crop+annotate",
      passed: Boolean(screenshot2Exists && screenshot2SizeOk),
      details: screenshot2?.localPath
        ? `path=${screenshot2.localPath}, size=${screenshot2.width}x${screenshot2.height}`
        : `Resposta inválida: ${screenshot2Text.slice(0, 200)}`,
    });

    const screenshot3Text = await callToolText(client, "screenshot", {
      serial,
      inlineBase64: true,
    });
    const screenshot3 = parseJsonSafe<ScreenshotResponse>(screenshot3Text);
    const screenshot3HasBase64 = Boolean(screenshot3?.inlineBase64 && screenshot3.inlineBase64.length > 100);
    results.push({
      name: "screenshot inlineBase64",
      passed: screenshot3HasBase64,
      details: screenshot3HasBase64
        ? `base64Length=${screenshot3?.inlineBase64?.length}`
        : `Sem base64 no payload: ${screenshot3Text.slice(0, 200)}`,
    });

    await sleep(1500);

    const stopText = await callToolText(client, "screenrecord_stop", {
      serial,
      sessionId: activeSessionId,
      inlineBase64: false,
    });
    const stop = parseJsonSafe<ScreenrecordStopResponse>(stopText);
    activeSessionId = undefined;
    const videoExists = stop?.localPath ? await fileExists(stop.localPath) : false;
    const stopNameOk = Boolean(
      stop?.sessionId && stop?.localPath && stop.localPath.replace(/\\/g, "/").endsWith(`/records/${stop.sessionId}.mp4`)
    );
    results.push({
      name: "screenrecord_stop",
      passed: Boolean(videoExists && stopNameOk),
      details: stop?.localPath
        ? `path=${stop.localPath}, durationMs=${stop.durationMs ?? "n/a"}`
        : `Resposta inválida: ${stopText.slice(0, 200)}`,
    });

    const invalidStopText = await callToolText(client, "screenrecord_stop", {
      serial,
      sessionId: "session-inexistente",
      inlineBase64: false,
    });
    const invalidStopOk = invalidStopText.includes("Código: SCREENRECORD_SESSION_NOT_FOUND");
    results.push({
      name: "screenrecord_stop sessão inválida",
      passed: invalidStopOk,
      details: invalidStopOk ? "Código esperado retornado" : invalidStopText.slice(0, 200),
    });
  } finally {
    if (activeSessionId && serial) {
      try {
        await callToolText(client, "screenrecord_stop", {
          serial,
          sessionId: activeSessionId,
          inlineBase64: false,
        });
      } catch {
      }
    }

    if (startedByRunner && serial) {
      try {
        await callToolText(client, "avd_stop", { serial });
      } catch {
      }
    }

    await client.close();
    await transport.close();
  }

  const passed = results.filter((result) => result.passed).length;
  const failed = results.length - passed;

  console.log("\n=== Media Tools Scenario Report ===");
  for (const result of results) {
    console.log(`- [${result.passed ? "OK" : "FAIL"}] ${result.name}: ${result.details}`);
  }
  console.log(`Resumo: ${passed} OK / ${failed} FAIL`);

  if (failed > 0) {
    process.exitCode = 1;
  }
}

run().catch((error: unknown) => {
  console.error("Erro ao executar cenários de mídia:", error);
  process.exitCode = 1;
});
