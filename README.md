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

### Tool: `screenrecord_start`

Inicia gravação de tela com `adb shell screenrecord` e retorna `sessionId` para finalização posterior.

**Parameters:**

- `serial` (optional): Serial alvo.
- `maxDurationSeconds` (optional): Limite máximo da gravação. Default `120`.
- `bitRate` (optional): Bitrate do vídeo (ex.: `4000000`).
- `size` (optional): Resolução (ex.: `1280x720`).

### Tool: `screenrecord_stop`

Finaliza gravação por `sessionId`, faz pull do arquivo para artifacts e remove o arquivo temporário do device.

**Parameters:**

- `sessionId` (required): Session retornada por `screenrecord_start`.
- `serial` (optional): Validado contra a sessão ativa.
- `inlineBase64` (optional): Retorna vídeo em base64 no payload.

### Tool: `screenshot`

Captura screenshot com suporte a crop, compressão e anotação textual.

**Parameters:**

- `serial` (optional): Serial alvo.
- `crop` (optional): `{ x, y, width, height }`.
- `compressQuality` (optional): 0 a 100.
- `annotate` (optional): lista de textos `{ text, x, y }`.
- `inlineBase64` (optional): Retorna PNG em base64 no payload.

### Tool: `network_toggle`

Liga/desliga wifi, dados móveis e modo avião.

**Parameters:**

- `serial` (optional): Serial alvo.
- `wifiEnabled` (required): Liga/desliga wifi.
- `dataEnabled` (optional): Liga/desliga dados móveis.
- `airplaneMode` (optional): Liga/desliga modo avião.

### Tool: `network_condition`

Aplica condição de rede no emulador por perfil pronto (`good`, `slow_3g`, `lte`, `offline`) ou perfil avançado.

**Parameters:**

- `serial` (optional): Serial alvo.
- `profile` (required):
  - string: `good` | `slow_3g` | `lte` | `offline`
  - objeto avançado: `{ latencyMs?, packetLoss?, speedKbps? }`

### Tool: `set_location`

Define coordenadas GPS no emulador via `adb emu geo fix <lon> <lat>`.

**Parameters:**

- `serial` (optional): Serial alvo.
- `latitude` (required): entre `-90` e `90`.
- `longitude` (required): entre `-180` e `180`.

### Tool: `set_battery_state`

Define nível e estado de carga da bateria via `dumpsys battery`.

**Parameters:**

- `serial` (optional): Serial alvo.
- `level` (optional): 0 a 100.
- `charging` (optional): `true` para carregando, `false` para descarregando.

### Tool: `set_rotation`

Define orientação da tela via `settings put system`.

**Parameters:**

- `serial` (optional): Serial alvo.
- `orientation` (required): `portrait` | `landscape`.

### Tool: `set_locale`

Define locale via `setprop` e broadcast de locale.

**Parameters:**

- `serial` (optional): Serial alvo.
- `language` (required): ex. `pt`, `en`.
- `country` (optional): ex. `BR`, `US`.

### API level limitations

Alguns comandos variam entre versões de Android e builds de sistema (AOSP/OEM). Em especial, `svc data`, `settings put global airplane_mode_on`, `dumpsys battery set ...`, `user_rotation` e mudanças de locale por `setprop` podem exigir permissões diferentes, reboot, restart de app ou podem não surtir efeito imediato em APIs mais novas. Para estabilidade em CI, prefira emuladores AOSP com API fixa por pipeline e valide a efetividade no app (não apenas o exit code do adb).

### Structured logging

O servidor usa logging estruturado em `src/observability/logger.ts` com `logInfo`, `logWarn` e `logError`, sempre com payload `{ traceId, tool, message, data? }`.

- Formato humano (default): linha legível para terminal.
- Formato JSON (uma linha por evento): habilite com `AVD_MCP_JSON_LOGS=true`.

Todas as tools MCP registram início e fim da execução com `durationMs`, incluindo `tool`, `traceId`, `deviceId` e `success` (`true`/`false`) nos logs de conclusão.

### Formato padrão de erro das tools

Quando uma tool falha, a resposta textual retorna um JSON padronizado com os campos:

- `code`: código curto da falha.
- `message`: mensagem legível para humano.
- `hints` (opcional): sugestões de correção.
- `validOptions` (opcional): opções válidas para o campo.

Exemplo geral:

```json
{
  "code": "INVALID_INPUT",
  "message": "Parâmetros inválidos para avd_start.",
  "hints": ["Verifique os campos obrigatórios."],
  "validOptions": null
}
```

#### Exemplo: `avd_start` com `avdName` inválido

```json
{
  "code": "AVD_NOT_FOUND",
  "message": "avdName \"Pixel_7_Pro_API_36\" não encontrado.",
  "hints": ["Você quis dizer Pixel_7_Pro_API_35?"],
  "validOptions": [
    "Pixel_7_Pro_API_35",
    "Pixel_8_API_34",
    "Medium_Tablet_API_34"
  ]
}
```

#### Exemplo: `avd_start` com `gpuMode` inválido

```json
{
  "code": "INVALID_GPU_MODE",
  "message": "gpuMode inválido: vulkan.",
  "hints": ["Use um dos valores suportados: auto, host, swiftshader_indirect."],
  "validOptions": ["auto", "host", "swiftshader_indirect"]
}
```

#### Exemplo: `adb_shell` com comando proibido

```json
{
  "code": "SHELL_COMMAND_NOT_ALLOWED",
  "message": "Comando não permitido em safe mode. Comandos permitidos: pm list packages [filtro], pm grant <package> <permission>, pm clear <package>, am start ..., am force-stop <package>, monkey -p <package> -c android.intent.category.launcher 1, svc wifi enable|disable, svc data enable|disable, settings put|get (global|system) ..., dumpsys battery, dumpsys battery set level|status|plugged <valor>, dumpsys battery reset, getprop [key], setprop persist.sys.locale|language|country <valor>, rm /sdcard/mcp_record_<timestamp>.mp4, input keyevent|tap|swipe|text ...",
  "hints": ["Use adb_shell apenas para comandos na allowlist."],
  "validOptions": [
    "pm list packages [filtro]",
    "pm grant <package> <permission>",
    "pm clear <package>",
    "am start ...",
    "am force-stop <package>",
    "monkey -p <package> -c android.intent.category.launcher 1",
    "svc wifi enable|disable",
    "svc data enable|disable",
    "settings put|get (global|system) ...",
    "dumpsys battery",
    "dumpsys battery set level|status|plugged <valor>",
    "dumpsys battery reset",
    "getprop [key]",
    "setprop persist.sys.locale|language|country <valor>",
    "rm /sdcard/mcp_record_<timestamp>.mp4",
    "input keyevent|tap|swipe|text ..."
  ]
}
```

### Safe mode e allowlist

O servidor valida todos os comandos `adb shell` em uma função central (`src/adb/shell-safety.ts`) com allowlist de padrões permitidos. Com isso, comandos fora da lista são bloqueados com erro de segurança.

Com `AVD_MCP_SAFE_MODE=true` (default), há bloqueios extras para comandos perigosos, incluindo:

- `reboot` e `reboot bootloader`
- `rm` destrutivo (ex.: `rm -rf /`, remoções em áreas críticas)
- `format` e `wipe` fora de fluxos controlados

Para desenvolvimento local, é possível desativar o modo estrito com `AVD_MCP_SAFE_MODE=false`. Mesmo assim, a allowlist continua ativa.

Não desative `safeMode` em CI/prod: isso reduz proteção contra comandos destrutivos e aumenta risco operacional em hosts compartilhados.

### Segurança de paths e comandos

- Inputs de comando são sanitizados (sem quebra de linha, sem `\0`, etc.).
- Paths locais recebidos por tools são validados para ficar dentro da pasta base.
- Pasta base padrão: diretório atual do processo (`process.cwd()`), configurável por `AVD_MCP_WORKSPACE_DIR`.

### Tool: `get_metrics`

Retorna métricas simples desde o start do processo.

**Output (shape):**

- `startedAt`
- `uptimeMs`
- `totalExecutions`
- `tools[]` com: `tool`, `executions`, `avgDurationMs`

### Media configuration

- `MCP_ARTIFACTS_DIR`: diretório raiz de artifacts (default `.artifacts`).
- `MCP_INLINE_BASE64`: padrão global para retorno base64 (`true/false`, default `false`).
- Estrutura de saída:
  - `${MCP_ARTIFACTS_DIR}/records/<sessionId>.mp4`
  - `${MCP_ARTIFACTS_DIR}/screenshots/<timestamp>_<traceId>.png`

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

Example: start screenrecord

```json
{
  "method": "tools/call",
  "params": {
    "name": "screenrecord_start",
    "arguments": {
      "serial": "emulator-5554",
      "maxDurationSeconds": 60,
      "bitRate": 4000000,
      "size": "1280x720"
    }
  }
}
```

Example: stop screenrecord

```json
{
  "method": "tools/call",
  "params": {
    "name": "screenrecord_stop",
    "arguments": {
      "sessionId": "<SESSION_ID>",
      "serial": "emulator-5554",
      "inlineBase64": false
    }
  }
}
```

Example: screenshot with crop + annotate

```json
{
  "method": "tools/call",
  "params": {
    "name": "screenshot",
    "arguments": {
      "serial": "emulator-5554",
      "crop": {
        "x": 100,
        "y": 200,
        "width": 900,
        "height": 1600
      },
      "compressQuality": 80,
      "annotate": [
        { "text": "Login", "x": 120, "y": 240 },
        { "text": "CTA", "x": 500, "y": 1500 }
      ],
      "inlineBase64": false
    }
  }
}
```

Example: network slow 3G profile

```json
{
  "method": "tools/call",
  "params": {
    "name": "network_condition",
    "arguments": {
      "serial": "emulator-5554",
      "profile": "slow_3g"
    }
  }
}
```

Example: toggle airplane mode

```json
{
  "method": "tools/call",
  "params": {
    "name": "network_toggle",
    "arguments": {
      "serial": "emulator-5554",
      "wifiEnabled": false,
      "dataEnabled": false,
      "airplaneMode": true
    }
  }
}
```

Example: set Curitiba location

```json
{
  "method": "tools/call",
  "params": {
    "name": "set_location",
    "arguments": {
      "serial": "emulator-5554",
      "latitude": -25.4284,
      "longitude": -49.2733
    }
  }
}
```

Example: set low battery not charging

```json
{
  "method": "tools/call",
  "params": {
    "name": "set_battery_state",
    "arguments": {
      "serial": "emulator-5554",
      "level": 5,
      "charging": false
    }
  }
}
```

Example: set locale pt-BR

```json
{
  "method": "tools/call",
  "params": {
    "name": "set_locale",
    "arguments": {
      "serial": "emulator-5554",
      "language": "pt",
      "country": "BR"
    }
  }
}
```

## Automated scenario runners

Para validar fluxos ponta a ponta no MCP, use os runners abaixo:

- `pnpm test:adb-tools`: cenários de install/uninstall/shell/logcat.
- `pnpm test:media-tools`: cenários de screenrecord e screenshot (crop/annotate/base64).
- `pnpm test:network-device-tools`: cenários de rede, localização, locale e bateria.

Todos os runners geram relatório `OK/FAIL` no terminal e retornam código de saída `1` quando existe falha em cenário.

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
