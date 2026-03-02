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

type ToolJsonResponse = {
  stdout?: string;
  stderr?: string;
  exitCode?: number;
  durationMs?: number;
};

const apkPath = process.env.ADB_TEST_APK_PATH ?? "C:\\temp\\sample.apk";
const packageName = process.env.ADB_TEST_PACKAGE ?? "com.example.sample";

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

function parseJsonResponse(text: string): ToolJsonResponse {
  try {
    return JSON.parse(text) as ToolJsonResponse;
  } catch {
    return {};
  }
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

function countLines(text: string): number {
  if (!text || text.trim().length === 0) return 0;
  return text.split(/\r?\n/).length;
}

async function ensureOnlineSerial(client: Client): Promise<string> {
  const statusText = await callToolText(client, "avd_status", {});
  try {
    const parsed = JSON.parse(statusText) as {
      devices?: Array<{ serial: string; state: string; isEmulator: boolean }>;
    };

    const onlineEmulator = parsed.devices?.find(
      (device) => device.state === "device" && device.isEmulator
    );

    if (onlineEmulator?.serial) {
      return onlineEmulator.serial;
    }
  } catch {
  }

  const listText = await callToolText(client, "avd_list", {});
  const avdNames = extractAvdNames(listText);
  if (avdNames.length === 0) {
    throw new Error("Nenhum AVD disponível para iniciar cenário ADB.");
  }

  const startText = await callToolText(client, "avd_start", {
    avdName: avdNames[0],
    noWindow: true,
    gpuMode: "swiftshader_indirect",
    waitForBoot: true,
  });

  const serial = extractEmulatorSerials(startText)[0];
  if (!serial) {
    throw new Error("Falha ao descobrir serial após avd_start.");
  }

  return serial;
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
    { name: "avd-mcp-adb-scenarios", version: "0.1.0" },
    { capabilities: {} }
  );

  const results: ScenarioResult[] = [];

  try {
    await client.connect(transport);
    const serial = await ensureOnlineSerial(client);

    const installText = await callToolText(client, "adb_install_apk", {
      serial,
      apkPath,
      timeoutMs: 120000,
    });
    const installResult = parseJsonResponse(installText);
    const installOk = installResult.exitCode === 0;

    results.push({
      name: "adb_install_apk (happy path)",
      passed: installOk,
      details: installOk
        ? `exitCode=${installResult.exitCode ?? "n/a"}, durationMs=${installResult.durationMs ?? "n/a"}`
        : `exitCode=${installResult.exitCode ?? "n/a"}, stderr=${(installResult.stderr ?? "").slice(0, 240)}, stdout=${(installResult.stdout ?? "").slice(0, 240)}`,
    });

    const packageCheckAfterInstallText = await callToolText(client, "adb_shell", {
      serial,
      command: `pm list packages ${packageName}`,
      timeoutMs: 30000,
    });
    const packageCheckAfterInstall = parseJsonResponse(packageCheckAfterInstallText);
    const packageFound = (packageCheckAfterInstall.stdout ?? "").includes(`package:${packageName}`);

    results.push({
      name: "adb_shell validation after install",
      passed: packageFound,
      details: packageFound
        ? `Pacote encontrado: ${packageName}`
        : `stdout=${packageCheckAfterInstall.stdout ?? ""}`,
    });

    const logcatText = await callToolText(client, "adb_logcat", {
      serial,
      filter: "*:E",
      maxLines: 50,
      timeoutMs: 4000,
    });
    const logcatResult = parseJsonResponse(logcatText);
    const lines = countLines(logcatResult.stdout ?? "");
    const logcatOk = lines <= 50;

    results.push({
      name: "adb_logcat (line cap)",
      passed: logcatOk,
      details: `lines=${lines}, exitCode=${logcatResult.exitCode ?? "n/a"}`,
    });

    const uninstallText = await callToolText(client, "adb_uninstall", {
      serial,
      packageName,
      timeoutMs: 60000,
    });
    const uninstallResult = parseJsonResponse(uninstallText);
    const uninstallOk = uninstallResult.exitCode === 0;

    results.push({
      name: "adb_uninstall (happy path)",
      passed: uninstallOk,
      details: uninstallOk
        ? `exitCode=${uninstallResult.exitCode ?? "n/a"}, durationMs=${uninstallResult.durationMs ?? "n/a"}`
        : `exitCode=${uninstallResult.exitCode ?? "n/a"}, stderr=${(uninstallResult.stderr ?? "").slice(0, 240)}, stdout=${(uninstallResult.stdout ?? "").slice(0, 240)}`,
    });

    const packageCheckAfterUninstallText = await callToolText(client, "adb_shell", {
      serial,
      command: `pm list packages ${packageName}`,
      timeoutMs: 30000,
    });
    const packageCheckAfterUninstall = parseJsonResponse(packageCheckAfterUninstallText);
    const packageMissing = !(packageCheckAfterUninstall.stdout ?? "").includes(`package:${packageName}`);

    results.push({
      name: "adb_shell validation after uninstall",
      passed: packageMissing,
      details: packageMissing
        ? `Pacote removido: ${packageName}`
        : `stdout=${packageCheckAfterUninstall.stdout ?? ""}`,
    });

    const missingApkText = await callToolText(client, "adb_install_apk", {
      serial,
      apkPath: "C:\\temp\\missing.apk",
      timeoutMs: 30000,
    });
    const missingApkResult = parseJsonResponse(missingApkText);
    results.push({
      name: "adb_install_apk (APK inexistente)",
      passed: (missingApkResult.exitCode ?? 0) !== 0,
      details: `exitCode=${missingApkResult.exitCode ?? "n/a"}`,
    });

    const missingPackageText = await callToolText(client, "adb_uninstall", {
      serial,
      packageName: "com.example.inexistente",
      timeoutMs: 30000,
    });
    const missingPackageResult = parseJsonResponse(missingPackageText);
    results.push({
      name: "adb_uninstall (pacote inexistente)",
      passed: (missingPackageResult.exitCode ?? 0) !== 0,
      details: `exitCode=${missingPackageResult.exitCode ?? "n/a"}`,
    });

    const blockedShellText = await callToolText(client, "adb_shell", {
      serial,
      command: "reboot",
      timeoutMs: 10000,
    });
    results.push({
      name: "adb_shell (safe mode bloqueio)",
      passed: blockedShellText.includes("Código: SHELL_COMMAND_BLOCKED"),
      details: blockedShellText.includes("Código:") ? blockedShellText.split("\n")[1] ?? "" : blockedShellText,
    });

    const invalidSerialShellText = await callToolText(client, "adb_shell", {
      serial: "emulator-9999",
      command: "pm list packages",
      timeoutMs: 10000,
    });
    const invalidSerialShellResult = parseJsonResponse(invalidSerialShellText);
    results.push({
      name: "adb_shell (serial inválido/offline)",
      passed: (invalidSerialShellResult.exitCode ?? 0) !== 0,
      details: `exitCode=${invalidSerialShellResult.exitCode ?? "n/a"}`,
    });
  } finally {
    await client.close();
    await transport.close();
  }

  const passed = results.filter((result) => result.passed).length;
  const failed = results.length - passed;

  console.log("\n=== ADB Tools Scenario Report ===");
  for (const result of results) {
    console.log(`- [${result.passed ? "OK" : "FAIL"}] ${result.name}: ${result.details}`);
  }
  console.log(`Resumo: ${passed} OK / ${failed} FAIL`);

  if (failed > 0) {
    process.exitCode = 1;
  }
}

run().catch((error: unknown) => {
  console.error("Erro ao executar cenários ADB:", error);
  process.exitCode = 1;
});
