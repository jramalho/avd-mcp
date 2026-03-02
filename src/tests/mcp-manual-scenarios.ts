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

function parseStatusJson(text: string): { devices?: Array<{ serial: string; bootCompleted: boolean | null }> } {
  try {
    return JSON.parse(text) as { devices?: Array<{ serial: string; bootCompleted: boolean | null }> };
  } catch {
    return {};
  }
}

function extractCodeFromErrorText(text: string): string | undefined {
  const match = text.match(/Código:\s*([A-Z0-9_\-]+)/);
  return match?.[1];
}

async function stopAllEmulators(client: Client): Promise<void> {
  for (let i = 0; i < 5; i += 1) {
    const stopText = await callToolText(client, "avd_stop", {});
    if (stopText.includes("Código: NO_EMULATOR_ONLINE")) {
      return;
    }
  }
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
    { name: "avd-mcp-manual-scenarios", version: "0.1.0" },
    { capabilities: {} }
  );

  const results: ScenarioResult[] = [];
  let selectedAvd: string | undefined;
  let selectedSerial: string | undefined;

  try {
    await client.connect(transport);

    const listText = await callToolText(client, "avd_list", {});
    if (listText.includes("Código: UNEXPECTED_ERROR") && listText.includes("spawn emulator ENOENT")) {
      throw new Error("emulator não encontrado no ambiente do teste (ENOENT)");
    }

    const avdNames = extractAvdNames(listText);
    if (avdNames.length === 0) {
      throw new Error("Nenhum AVD disponível para executar cenário manual.");
    }

    selectedAvd = avdNames[0];

    const startText = await callToolText(client, "avd_start", {
      avdName: selectedAvd,
      noWindow: true,
      gpuMode: "swiftshader_indirect",
      waitForBoot: true,
    });

    selectedSerial = extractEmulatorSerials(startText)[0];
    results.push({
      name: "1) avd_start",
      passed: Boolean(selectedSerial),
      details: selectedSerial
        ? `Serial online detectado: ${selectedSerial}`
        : `Falha ao extrair serial da saída: ${startText}`,
    });

    if (selectedSerial) {
      const statusText = await callToolText(client, "avd_status", { serial: selectedSerial });
      const status = parseStatusJson(statusText);
      const device = status.devices?.find((item) => item.serial === selectedSerial);
      const bootOk = device?.bootCompleted === true;

      results.push({
        name: "2) avd_status boot_completed",
        passed: bootOk,
        details: bootOk
          ? `bootCompleted=true para ${selectedSerial}`
          : `Status inesperado para ${selectedSerial}: ${statusText}`,
      });

      const restartTimes: number[] = [];
      let restartOk = true;
      for (let i = 0; i < 3; i += 1) {
        const restartText = await callToolText(client, "avd_restart", {
          serial: selectedSerial,
          noWindow: true,
          gpuMode: "swiftshader_indirect",
          waitForBoot: true,
        });

        try {
          const parsed = JSON.parse(restartText) as { totalDurationMs?: number };
          const duration = parsed.totalDurationMs;
          if (typeof duration !== "number") {
            restartOk = false;
            break;
          }
          restartTimes.push(duration);
        } catch {
          restartOk = false;
          break;
        }
      }

      const avg = restartTimes.length
        ? Math.round(restartTimes.reduce((sum, value) => sum + value, 0) / restartTimes.length)
        : 0;

      results.push({
        name: "3) avd_restart média",
        passed: restartOk && restartTimes.length === 3,
        details:
          restartOk && restartTimes.length === 3
            ? `Média de restart (3 execuções): ${avg} ms; amostras=${restartTimes.join(",")}`
            : "Falha ao coletar durations do avd_restart",
      });
    }

    await stopAllEmulators(client);
    const noOnlineText = await callToolText(client, "avd_restart", {});
    const noOnlineCode = extractCodeFromErrorText(noOnlineText);
    results.push({
      name: "4) avd_restart sem AVD online",
      passed: noOnlineCode === "NO_EMULATOR_ONLINE",
      details: `Código retornado: ${noOnlineCode ?? "(nenhum)"}`,
    });

    const invalidStatusText = await callToolText(client, "avd_status", { serial: "emulator-9999" });
    const invalidStatusCode = extractCodeFromErrorText(invalidStatusText);

    const invalidRestartText = await callToolText(client, "avd_restart", {
      serial: "emulator-9999",
      waitForBoot: true,
    });
    const invalidRestartCode = extractCodeFromErrorText(invalidRestartText);

    results.push({
      name: "5) serial inválido",
      passed: invalidStatusCode === "SERIAL_NOT_FOUND" && invalidRestartCode === "SERIAL_NOT_ONLINE",
      details: `status=${invalidStatusCode ?? "(nenhum)"}, restart=${invalidRestartCode ?? "(nenhum)"}`,
    });
  } finally {
    await client.close();
    await transport.close();
  }

  const passed = results.filter((result) => result.passed).length;
  const failed = results.length - passed;

  console.log("\n=== Manual MCP Test Report ===");
  for (const result of results) {
    console.log(`- [${result.passed ? "OK" : "FAIL"}] ${result.name}: ${result.details}`);
  }
  console.log(`Resumo: ${passed} OK / ${failed} FAIL`);

  if (failed > 0) {
    process.exitCode = 1;
  }
}

run().catch((error: unknown) => {
  console.error("Erro ao executar cenários manuais:", error);
  process.exitCode = 1;
});
