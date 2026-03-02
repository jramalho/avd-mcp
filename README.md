# AVD MCP Server

A Model Context Protocol (MCP) server for Android Virtual Device automation. It can start an emulator, execute commands, and capture screenshots automatically.

## Features

- Automatically starts Android Virtual Device (AVD) if not running
- Executes commands (`pnpm`, `gradle`, `npm`, etc.)
- Captures screenshots from the emulator
- Returns command output and screenshot in base64 format

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

### Tool: `avd_run_and_screenshot`

Starts an AVD (if needed), executes a command, waits, and captures a screenshot.

**Parameters:**

- `avdName` (optional): AVD name. If omitted and no device is online, the first available AVD from `emulator -list-avds` is used.
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
  "coldBoot": true,
  "noWindow": false,
  "readOnly": false,
  "gpuMode": "host",
  "command": "pnpm android",
  "waitMsAfterRun": 5000
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

## Publishing to npm

```bash
npm login
npm version patch
npm publish
```

## License

MIT License - see [LICENSE](LICENSE).
