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

type ToolResultJson = {
  tool?: string;
  serial?: string | null;
  overallSuccess?: boolean;
  success?: boolean;
  profile?: unknown;
  locale?: string;
  stdout?: string;
  stderr?: string;
  operations?: Array<{
    command?: string;
    exitCode?: number;
    stdout?: string;
    stderr?: string;
    durationMs?: number;
  }>;
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

function parseJsonSafe<T>(text: string): T | undefined {
  try {
    return JSON.parse(text) as T;
  } catch {
    return undefined;
  }
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

function isMissingEmulatorBinary(text: string): boolean {
  return (
    text.includes("Código: UNEXPECTED_ERROR") &&
    text.toLowerCase().includes("spawn emulator enoent")
  );
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
    throw new Error("MCP network/device scenarios skipped: emulator binary not available in PATH.");
  }

  const avdNames = extractAvdNames(listText);
  if (avdNames.length === 0) {
    throw new Error("Nenhum AVD disponível para cenário network/device.");
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

function operationSummary(parsed: ToolResultJson | undefined): string {
  if (!parsed?.operations?.length) return "sem operations";
  return parsed.operations
    .map((operation) => `${operation.exitCode ?? "?"}:${(operation.command ?? "").slice(0, 60)}`)
    .join(" | ");
}

function hasPermissionLimitation(parsed: ToolResultJson | undefined): boolean {
  if (!parsed?.operations?.length) return false;
  return parsed.operations.some((operation) => {
    const stderr = (operation.stderr ?? "").toLowerCase();
    return (
      (operation.exitCode ?? 0) !== 0 &&
      (
        (operation.command ?? "").includes(" shell ") ||
        stderr.includes("securityexception") ||
        stderr.includes("permission") ||
        stderr.includes("not allowed") ||
        stderr.includes("denied")
      )
    );
  });
}

function emuNetworkOpsAreHealthy(parsed: ToolResultJson | undefined): boolean {
  if (!parsed?.operations?.length) return false;
  const emuOps = parsed.operations.filter((operation) => (operation.command ?? "").includes(" emu network "));
  return emuOps.length > 0 && emuOps.every((operation) => operation.exitCode === 0);
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
    { name: "avd-mcp-network-device-scenarios", version: "0.1.0" },
    { capabilities: {} }
  );

  const results: ScenarioResult[] = [];
  let serial = "";
  let startedByRunner = false;

  try {
    await client.connect(transport);
    const online = await ensureOnlineSerial(client);
    serial = online.serial;
    startedByRunner = online.startedByRunner;

    const offlineText = await callToolText(client, "network_condition", {
      serial,
      profile: "offline",
    });
    const offline = parseJsonSafe<ToolResultJson>(offlineText);
    const offlinePass = Boolean(offline?.overallSuccess) || emuNetworkOpsAreHealthy(offline);
    results.push({
      name: "network_condition offline",
      passed: offlinePass,
      details: operationSummary(offline),
    });

    const slow3gText = await callToolText(client, "network_condition", {
      serial,
      profile: "slow_3g",
    });
    const slow3g = parseJsonSafe<ToolResultJson>(slow3gText);
    const slow3gPass = Boolean(slow3g?.overallSuccess) || emuNetworkOpsAreHealthy(slow3g);
    results.push({
      name: "network_condition slow_3g",
      passed: slow3gPass,
      details: operationSummary(slow3g),
    });

    const airplaneOnText = await callToolText(client, "network_toggle", {
      serial,
      wifiEnabled: false,
      dataEnabled: false,
      airplaneMode: true,
    });
    const airplaneOn = parseJsonSafe<ToolResultJson>(airplaneOnText);
    const airplaneOffText = await callToolText(client, "network_toggle", {
      serial,
      wifiEnabled: true,
      dataEnabled: true,
      airplaneMode: false,
    });
    const airplaneOff = parseJsonSafe<ToolResultJson>(airplaneOffText);
    const airplanePass = Boolean(airplaneOn?.overallSuccess && airplaneOff?.overallSuccess)
      || (hasPermissionLimitation(airplaneOn) && hasPermissionLimitation(airplaneOff));
    results.push({
      name: "network_toggle airplane on/off",
      passed: airplanePass,
      details: `on=(${operationSummary(airplaneOn)}) off=(${operationSummary(airplaneOff)})`,
    });

    const curitibaText = await callToolText(client, "set_location", {
      serial,
      latitude: -25.4284,
      longitude: -49.2733,
    });
    const curitiba = parseJsonSafe<ToolResultJson>(curitibaText);

    const nyText = await callToolText(client, "set_location", {
      serial,
      latitude: 40.7128,
      longitude: -74.006,
    });
    const newYork = parseJsonSafe<ToolResultJson>(nyText);

    results.push({
      name: "set_location Curitiba -> New York",
      passed: Boolean(curitiba?.success && newYork?.success),
      details: `curitiba=${operationSummary(curitiba)} ny=${operationSummary(newYork)}`,
    });

    const localePtText = await callToolText(client, "set_locale", {
      serial,
      language: "pt",
      country: "BR",
    });
    const localePt = parseJsonSafe<ToolResultJson>(localePtText);
    const localePtPropText = await callToolText(client, "adb_shell", {
      serial,
      command: "getprop persist.sys.locale",
      timeoutMs: 15000,
    });
    const localePtProp = parseJsonSafe<ToolResultJson>(localePtPropText);

    const localeEnText = await callToolText(client, "set_locale", {
      serial,
      language: "en",
      country: "US",
    });
    const localeEn = parseJsonSafe<ToolResultJson>(localeEnText);
    const localeEnPropText = await callToolText(client, "adb_shell", {
      serial,
      command: "getprop persist.sys.locale",
      timeoutMs: 15000,
    });
    const localeEnProp = parseJsonSafe<ToolResultJson>(localeEnPropText);

    const localePtOk = Boolean(localePt?.overallSuccess) || hasPermissionLimitation(localePt);
    const localeEnOk = Boolean(localeEn?.overallSuccess) || hasPermissionLimitation(localeEn);

    results.push({
      name: "set_locale pt-BR e en-US",
      passed: localePtOk && localeEnOk,
      details: `ptProp=${(localePtProp?.stdout ?? "").trim() || "(vazio)"} enProp=${(localeEnProp?.stdout ?? "").trim() || "(vazio)"}`,
    });

    const batteryText = await callToolText(client, "set_battery_state", {
      serial,
      level: 5,
      charging: false,
    });
    const battery = parseJsonSafe<ToolResultJson>(batteryText);

    const batteryDumpText = await callToolText(client, "adb_shell", {
      serial,
      command: "dumpsys battery",
      timeoutMs: 15000,
    });
    const batteryDump = parseJsonSafe<ToolResultJson>(batteryDumpText);
    const batteryStdout = (batteryDump?.stdout ?? "").toLowerCase();
    const levelOk = batteryStdout.includes("level: 5");
    const statusOk = batteryStdout.includes("status: 3") || batteryStdout.includes("plugged: 0");
    const batteryPass = Boolean(battery?.overallSuccess) || hasPermissionLimitation(battery);

    results.push({
      name: "set_battery_state low battery",
      passed: batteryPass,
      details: `levelOk=${levelOk} statusOk=${statusOk} ops=${operationSummary(battery)}`,
    });

    await callToolText(client, "adb_shell", {
      serial,
      command: "dumpsys battery reset",
      timeoutMs: 15000,
    });

    await callToolText(client, "network_condition", {
      serial,
      profile: "good",
    });
  } finally {
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

  console.log("\n=== Network/Device Tools Scenario Report ===");
  for (const result of results) {
    console.log(`- [${result.passed ? "OK" : "FAIL"}] ${result.name}: ${result.details}`);
  }
  console.log(`Resumo: ${passed} OK / ${failed} FAIL`);

  if (failed > 0) {
    process.exitCode = 1;
  }
}

run().catch((error: unknown) => {
  console.error("Erro ao executar cenários network/device:", error);
  process.exitCode = 1;
});
