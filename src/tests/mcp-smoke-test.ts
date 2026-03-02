import { strict as assert } from "node:assert";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const expectedTools = [
  "avd_list",
  "avd_start",
  "avd_stop",
  "avd_run_and_screenshot",
  "avd_status",
  "avd_restart",
  "adb_install_apk",
  "adb_uninstall",
  "adb_shell",
  "adb_logcat",
  "app_launch",
  "app_force_stop",
  "open_deeplink",
  "grant_permissions",
  "clear_app_data",
] as const;

type TextContent = { type: "text"; text: string };
type ToolCallWithContent = {
  content: Array<{ type: string; text?: string }>;
};

function getChildEnv(): Record<string, string> {
  return Object.entries(process.env).reduce<Record<string, string>>((acc, [key, value]) => {
    if (typeof value === "string") {
      acc[key] = value;
    }
    return acc;
  }, {});
}

function extractEmulatorSerials(text: string): string[] {
  return [...text.matchAll(/emulator-\d+/g)].map((match) => match[0]);
}

function extractAvdNames(listText: string): string[] {
  return listText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- "))
    .map((line) => line.slice(2).trim())
    .filter((line) => line.length > 0);
}

function isMissingEmulatorBinary(text: string): boolean {
  return (
    text.includes("Código: UNEXPECTED_ERROR") &&
    text.toLowerCase().includes("spawn emulator enoent")
  );
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
    { name: "avd-mcp-smoke", version: "0.1.0" },
    { capabilities: {} }
  );

  let startedSerial: string | undefined;
  let stoppedSerial = false;

  try {
    await client.connect(transport);

    const toolsResult = await client.listTools();
    const toolNames = new Set(toolsResult.tools.map((tool) => tool.name));
    for (const tool of expectedTools) {
      assert.equal(toolNames.has(tool), true, `Tool ausente: ${tool}`);
    }

    const listText = await callToolText(client, "avd_list", {});

    if (isMissingEmulatorBinary(listText)) {
      console.warn("MCP smoke test skipped: emulator binary not available in PATH.");
      return;
    }

    assert.equal(
      listText.includes("AVDs disponíveis") || listText.includes("Nenhum AVD encontrado"),
      true,
      "avd_list deve retornar status de disponibilidade"
    );

    const avdNames = extractAvdNames(listText);
    assert.ok(avdNames.length > 0, "Necessário ao menos um AVD configurado para smoke test.");

    const selectedAvd = avdNames[0]!;
    const startText = await callToolText(client, "avd_start", {
      avdName: selectedAvd,
      noWindow: true,
      gpuMode: "swiftshader_indirect",
      waitForBoot: true,
    });

    const serialsAfterStart = extractEmulatorSerials(startText);
    assert.ok(serialsAfterStart.length > 0, "avd_start deve retornar ao menos um serial online");
    startedSerial = serialsAfterStart[0];

    const stopText = await callToolText(client, "avd_stop", {
      serial: startedSerial,
    });
    stoppedSerial = true;
    assert.equal(
      stopText.includes("Emulador encerrado"),
      true,
      "avd_stop deve confirmar encerramento"
    );

    console.log("MCP smoke test passed");
  } finally {
    if (startedSerial && !stoppedSerial) {
      try {
        await callToolText(client, "avd_stop", { serial: startedSerial });
      } catch {
      }
    }

    await client.close();
    await transport.close();
  }
}

run().catch((error: unknown) => {
  console.error("MCP smoke test failed:", error);
  process.exitCode = 1;
});
