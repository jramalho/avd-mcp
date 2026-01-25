# AVD MCP Server

A Model Context Protocol (MCP) server for Android Virtual Device automation. This tool allows you to start an Android emulator, execute commands, and capture screenshots automatically.

## Features

-  Automatically starts Android Virtual Device (AVD) if not running
-  Executes commands (pnpm, gradle, npm, etc.)
-  Captures screenshots from the emulator
-  Returns command output and screenshot in base64 format

## Prerequisites

- [Android SDK](https://developer.android.com/studio) with `adb` and `emulator` in PATH
- [Node.js](https://nodejs.org/) 18 or higher
- An Android Virtual Device configured in Android Studio

## Installation

### Quick Start (Recommended)

No installation needed! Just add to your MCP client config (e.g., Claude Desktop):

``json
{
  "mcpServers": {
    "avd-mcp": {
      "command": "npx",
      "args": ["avd-mcp"]
    }
  }
}
``

That's it! The package will be automatically downloaded and executed when needed.

### Local Development

``bash
# Clone the repository
git clone https://github.com/yourusername/avd-mcp.git
cd avd-mcp

# Install dependencies
pnpm install

# Build the project
pnpm build

# Test locally
node dist/index.js
``

## Usage

### Available Tools

#### `avd_run_and_screenshot`

Starts an AVD (if not running), executes a command, waits, and captures a screenshot.

**Parameters:**
- `avdName` (optional): Name of the AVD to start. If omitted and no device is running, will throw an error.
- `command` (required): Command to execute (e.g., `pnpm android`, `gradle assembleDebug`)
- `waitMsAfterRun` (optional): Milliseconds to wait after command execution before taking screenshot. Default: 2000ms

**Returns:**
- Command output (stdout/stderr)
- Screenshot in base64 format (PNG)

**Example:**

``typescript
{
  "avdName": "Pixel_5_API_31",
  "command": "pnpm android",
  "waitMsAfterRun": 5000
}
``

## How It Works

1. **Device Check**: Checks if an Android device/emulator is already running using `adb devices`
2. **Start Emulator**: If no device is running and `avdName` is provided, starts the emulator
3. **Execute Command**: Runs the specified command using PowerShell
4. **Wait**: Waits for the specified duration to allow UI updates
5. **Screenshot**: Captures a screenshot using `adb screencap`
6. **Return**: Returns both command output and screenshot

## Troubleshooting

### AVD not starting
- Verify AVD name matches one configured in Android Studio: `emulator -list-avds`
- Check that `emulator` is in your system PATH
- Ensure virtualization is enabled in BIOS (Intel VT-x or AMD-V)

### ADB not found
- Install Android SDK Platform-Tools
- Add Android SDK platform-tools to PATH: `C:\Users\YourUser\AppData\Local\Android\Sdk\platform-tools`

### Screenshot timeout
- Increase `waitMsAfterRun` parameter
- Check if device is fully booted: `adb shell getprop sys.boot_completed` (should return `1`)

## Publishing to npm

To publish this package to npm:

``bash
# Login to npm
npm login

# Update version in package.json
npm version patch  # or minor, or major

# Publish
npm publish
``

After publishing, users can use it directly with `npx avd-mcp` without cloning!

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Author

Created for automating Android development workflows with AI assistants.
