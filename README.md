# AVD MCP Server

A Model Context Protocol (MCP) server for Android Virtual Device automation. It can start an emulator, execute commands, and capture screenshots automatically.

## Features

- Automatically starts Android Virtual Device (AVD) if not running
- Executes commands (`pnpm`, `gradle`, `npm`, etc.)
- Captures screenshots from the emulator
- Returns command output and screenshot in base64 format
- Supports `serial` selection for device-specific actions
- Structured logs and standardized tool errors for better observability

## Prerequisites

- [Android SDK](https://developer.android.com/studio) with `adb` and `emulator` in PATH
- [Node.js](https://nodejs.org/) 18 or higher
- At least one AVD configured in Android Studio
- Shell available for command execution (`powershell` on Windows, `sh` on Linux/macOS, with `bash` and `zsh` fallback)

## Installation

### Quick Start

No installation needed. Add this to your MCP client config:

```json
{
  "mcpServers": {
    "avd-mcp": {
      "command": "npx",
      "args": ["avd-mcp"]
    }
  }
}
```

### Local Development

```bash
git clone https://github.com/jramalho/avd-mcp.git
cd avd-mcp
pnpm install
pnpm build
node dist/index.js
```

## Usage

## Project organization for new MCP tools

Keep a consistent pattern for every new tool:

```
src/
  application/
    <tool-name>-use-case.ts
  mcp/tools/
    definitions.ts             # inputSchema MCP + zod schemas
    handler.ts                 # dispatcher + error/log wrapper
  adapters/node/
    <integration>-adapter.ts
    command-helpers.ts          # runAdb, runEmulator, timeouts
  ports/
    <integration>-port.ts
  shared/
    errors/tool-error.ts        # friendly + technical error model
    logging/logger.ts           # structured JSON logs
  tests/
    mcp-smoke-test.ts           # E2E MCP smoke test via stdio client
  index.ts                      # bootstrap do servidor e wiring de dependências
```

Naming convention:

- Tool name: `avd_<action>` (example: `avd_start`, `avd_stop`)
- Use case class: `<Action>AvdUseCase` or `<Action>UseCase`
- Port interface: `<Capability>Port`
- Adapter class: `<Runtime><Capability>Adapter` (example: `AdbAdapter`)

Implementation baseline for every tool:

- Strong TypeScript typing in input/output contracts and ports
- Zod schema validation in `index.ts`
- Friendly error + technical details using `ToolError`
- Structured logs via `Logger` (`tool_call_started`, `tool_call_succeeded`, `tool_call_failed`)
- Optional `serial` parameter whenever action can target a specific device
- CI-ready options (`noWindow: true`, optional `gpuMode: "swiftshader_indirect"`)

### Tool: `avd_list`

Lists available AVDs from `emulator -list-avds`.

### Tool: `avd_start`

Starts an AVD with boot options.

**Parameters:**

- `avdName` (optional)
- `coldBoot` (optional): Uses `-no-snapshot-load`.
- `wipeData` (optional): Uses `-wipe-data`.
- `noWindow` (optional): Uses `-no-window`.
- `readOnly` (optional): Uses `-read-only`.
- `gpuMode` (optional): Uses `-gpu`, allowed values: `auto`, `host`, `swiftshader_indirect`.
- `waitForBoot` (optional): Wait for an online device before returning. Default `true`.

### Tool: `avd_stop`

Stops an online emulator using `adb emu kill`.

**Parameters:**

- `serial` (optional): Emulator serial (example: `emulator-5554`). If omitted, stops the first online emulator.

### Tool: `avd_status`

Retorna status dos devices conhecidos pelo `adb devices` em formato estruturado (JSON serializável).

**Parameters:**

- `serial` (optional): Se informado, retorna status detalhado só desse device.

**Output (shape):**

- `requestedSerial` (opcional)
- `generatedAt`
- `devices[]` com: `serial`, `state`, `isEmulator`, `avdName` (quando disponível), `bootCompleted`
- `summary` com contagens agregadas

### Tool: `avd_restart`

Reinicia um emulador: executa `adb emu kill`, espera sair do `adb devices` e inicia novamente reaproveitando a lógica de `avd_start`.

**Parameters:**

- `serial` (optional): Emulator serial alvo. Se omitido, usa o primeiro emulador online.
- `coldBoot` (optional): Uses `-no-snapshot-load`.
- `wipeData` (optional): Uses `-wipe-data`.
- `noWindow` (optional): Uses `-no-window`.
- `readOnly` (optional): Uses `-read-only`.
- `gpuMode` (optional): Uses `-gpu`, allowed values: `auto`, `host`, `swiftshader_indirect`.
- `waitForBoot` (optional): Aguarda boot completo (`sys.boot_completed=1`) antes de retornar.

**Output (shape):**

- `traceId`
- `targetSerial`
- `avdName`
- `stopDurationMs`
- `startDurationMs`
- `totalDurationMs`
- `onlineDevicesAfterRestart`

### Tool: `avd_run_and_screenshot`

Starts an AVD (if needed), executes a command, waits, and captures a screenshot.

**Parameters:**

- `avdName` (optional): AVD name. If omitted and no device is online, the first available AVD from `emulator -list-avds` is used.
- `serial` (optional): Target online device serial (example: `emulator-5554`). If provided, no auto-start is attempted.
- `command` (required): Command to execute.
- `coldBoot` (optional): Uses `-no-snapshot-load`.
- `wipeData` (optional): Uses `-wipe-data`.
- `noWindow` (optional): Uses `-no-window`.
- `readOnly` (optional): Uses `-read-only`.
- `gpuMode` (optional): Uses `-gpu`, allowed values: `auto`, `host`, `swiftshader_indirect`.
- `waitMsAfterRun` (optional): Wait time before screenshot. Default `2000`.

**Example:**

```json
{
  "avdName": "Pixel_5_API_31",
  "serial": "emulator-5554",
  "coldBoot": true,
  "noWindow": false,
  "readOnly": false,
  "gpuMode": "host",
  "command": "pnpm android",
  "waitMsAfterRun": 5000
}
```

### Tool: `adb_install_apk`

Instala APK no device via `adb install -r`.

**Parameters:**

- `serial` (optional): Serial alvo.
- `apkPath` (required): Caminho local do APK.
- `timeoutMs` (optional): Timeout da execução.

### Tool: `adb_uninstall`

Remove pacote do device via `adb uninstall`.

**Parameters:**

- `serial` (optional): Serial alvo.
- `packageName` (required): Exemplo `com.example.app`.
- `timeoutMs` (optional): Timeout da execução.

### Tool: `adb_shell`

Executa `adb shell <command>` em safe mode.

**Parameters:**

- `serial` (optional): Serial alvo.
- `command` (required): Comando shell único.
- `timeoutMs` (optional): Timeout da execução.

### Tool: `adb_logcat`

Lê logcat com timeout curto e limite de linhas.

**Parameters:**

- `serial` (optional): Serial alvo.
- `filter` (optional): Filtro de prioridade/tag.
- `maxLines` (optional): Quantidade máxima de linhas retornadas.
- `timeoutMs` (optional): Timeout da execução.

## MCP client call examples

From a client perspective, calls follow this shape:

```json
{
  "method": "tools/call",
  "params": {
    "name": "<tool-name>",
    "arguments": {}
  }
}
```

Example: list AVDs

```json
{
  "method": "tools/call",
  "params": {
    "name": "avd_list",
    "arguments": {}
  }
}
```

Example: start headless for CI

```json
{
  "method": "tools/call",
  "params": {
    "name": "avd_start",
    "arguments": {
      "avdName": "Pixel_5_API_31",
      "noWindow": true,
      "gpuMode": "swiftshader_indirect",
      "waitForBoot": true
    }
  }
}
```

Example: run command + screenshot in a specific serial

```json
{
  "method": "tools/call",
  "params": {
    "name": "avd_run_and_screenshot",
    "arguments": {
      "serial": "emulator-5554",
      "command": "pnpm android",
      "waitMsAfterRun": 4000
    }
  }
}
```

Example: stop a specific emulator

```json
{
  "method": "tools/call",
  "params": {
    "name": "avd_stop",
    "arguments": {
      "serial": "emulator-5554"
    }
  }
}
```

Example: get status from all devices

```json
{
  "method": "tools/call",
  "params": {
    "name": "avd_status",
    "arguments": {}
  }
}
```

Example: get status for one serial

```json
{
  "method": "tools/call",
  "params": {
    "name": "avd_status",
    "arguments": {
      "serial": "emulator-5554"
    }
  }
}
```

Example: restart one emulator (headless, wait boot)

```json
{
  "method": "tools/call",
  "params": {
    "name": "avd_restart",
    "arguments": {
      "serial": "emulator-5554",
      "noWindow": true,
      "gpuMode": "swiftshader_indirect",
      "waitForBoot": true
    }
  }
}
```

Example: install APK

```json
{
  "method": "tools/call",
  "params": {
    "name": "adb_install_apk",
    "arguments": {
      "serial": "emulator-5554",
      "apkPath": "C:\\builds\\app-debug.apk",
      "timeoutMs": 120000
    }
  }
}
```

Example: uninstall package

```json
{
  "method": "tools/call",
  "params": {
    "name": "adb_uninstall",
    "arguments": {
      "serial": "emulator-5554",
      "packageName": "com.example.app"
    }
  }
}
```

Example: adb shell (safe mode)

```json
{
  "method": "tools/call",
  "params": {
    "name": "adb_shell",
    "arguments": {
      "serial": "emulator-5554",
      "command": "pm list packages"
    }
  }
}
```

Example: adb logcat (simple)

```json
{
  "method": "tools/call",
  "params": {
    "name": "adb_logcat",
    "arguments": {
      "serial": "emulator-5554",
      "filter": "*:E",
      "maxLines": 100,
      "timeoutMs": 4000
    }
  }
}
```

## Troubleshooting

### Emulator not starting

- Check available AVDs with `emulator -list-avds`
- Ensure `emulator` is in PATH
- Ensure virtualization is enabled (Intel VT-x / AMD-V)

### ADB not found

- Install Android SDK Platform-Tools
- Add platform-tools to PATH (example): `C:\Users\YourUser\AppData\Local\Android\Sdk\platform-tools`

## License

MIT License - see [LICENSE](LICENSE).
