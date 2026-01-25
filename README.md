# AVD MCP Server

A Model Context Protocol (MCP) server for Android Virtual Device automation. This tool allows you to start an Android emulator, execute commands, and capture screenshots automatically.

## Features

-  Automatically starts Android Virtual Device (AVD) if not running
-  Executes commands (pnpm, gradle, npm, etc.)
-  Captures screenshots from the emulator
-  Returns command output and screenshot in base64 format

## Prerequisites

- [Android SDK](https://developer.android.com/studio) with db and emulator in PATH
- [Node.js](https://nodejs.org/) 18 or higher
- [pnpm](https://pnpm.io/) (recommended) or npm
- An Android Virtual Device configured in Android Studio

## Installation

`ash
# Clone the repository
git clone https://github.com/yourusername/avd-mcp.git
cd avd-mcp

# Install dependencies
pnpm install

# Build the project (if needed)
pnpm build
`

## Usage

### As an MCP Server

Add this server to your MCP client configuration (e.g., Claude Desktop):

`json
{
  "mcpServers": {
    "avd-mcp": {
      "command": "node",
      "args": ["path/to/avd-mcp/src/index.ts"]
    }
  }
}
`

Or using tsx:

`json
{
  "mcpServers": {
    "avd-mcp": {
      "command": "pnpm",
      "args": ["--dir", "path/to/avd-mcp", "dev"]
    }
  }
}
`

### Available Tools

#### vd_run_and_screenshot

Starts an AVD (if not running), executes a command, waits, and captures a screenshot.

**Parameters:**
- vdName (optional): Name of the AVD to start. If omitted and no device is running, will throw an error.
- command (required): Command to execute (e.g., pnpm android, gradle assembleDebug)
- waitMsAfterRun (optional): Milliseconds to wait after command execution before taking screenshot. Default: 2000ms

**Returns:**
- Command output (stdout/stderr)
- Screenshot in base64 format (PNG)

**Example:**

`	ypescript
{
  "avdName": "Pixel_5_API_31",
  "command": "pnpm android",
  "waitMsAfterRun": 5000
}
`

## Development

`ash
# Run in development mode
pnpm dev

# Type check
npx tsc --noEmit
`

## How It Works

1. **Device Check**: Checks if an Android device/emulator is already running using db devices
2. **Start Emulator**: If no device is running and vdName is provided, starts the emulator
3. **Execute Command**: Runs the specified command using PowerShell
4. **Wait**: Waits for the specified duration to allow UI updates
5. **Screenshot**: Captures a screenshot using db screencap
6. **Return**: Returns both command output and screenshot

## Troubleshooting

### AVD not starting
- Verify AVD name matches one configured in Android Studio: emulator -list-avds
- Check that emulator is in your system PATH
- Ensure virtualization is enabled in BIOS (Intel VT-x or AMD-V)

### ADB not found
- Install Android SDK Platform-Tools
- Add Android SDK platform-tools to PATH: C:\Users\YourUser\AppData\Local\Android\Sdk\platform-tools

### Screenshot timeout
- Increase waitMsAfterRun parameter
- Check if device is fully booted: db shell getprop sys.boot_completed (should return 1)

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Author

Created for automating Android development workflows with AI assistants.
