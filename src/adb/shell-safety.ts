import { ToolError } from "../shared/errors/tool-error.js";

const BLOCKED_PATTERNS: Array<{ code: string; pattern: RegExp; reason: string }> = [
  {
    code: "SHELL_COMMAND_BLOCKED",
    pattern: /(^|\s)reboot(\s+bootloader|\s|$)/i,
    reason: "comando reboot bloqueado",
  },
  {
    code: "SHELL_COMMAND_BLOCKED",
    pattern: /(^|\s)rm\s+-[a-z]*r[a-z]*f[a-z]*\s+(\/($|\s)|\/\*|\/data|\/system|\/vendor|\/product|\/proc|\/sys)/i,
    reason: "comando destrutivo bloqueado",
  },
  {
    code: "SHELL_COMMAND_BLOCKED",
    pattern: /(^|\s)rm\s+\/(data|system|vendor|product|proc|sys)(\s|$)/i,
    reason: "rm em área crítica bloqueado",
  },
  {
    code: "SHELL_COMMAND_BLOCKED",
    pattern: /(^|\s)(format|wipe)(\s|$)/i,
    reason: "format/wipe bloqueado em safe mode",
  },
  {
    code: "SHELL_COMMAND_BLOCKED",
    pattern: /(^|\s)shutdown(\s|$)/i,
    reason: "comando shutdown bloqueado",
  },
  {
    code: "SHELL_COMMAND_BLOCKED",
    pattern: /(^|\s)su(\s|$)/i,
    reason: "comando su bloqueado",
  },
];

const ALLOWED_PATTERNS: RegExp[] = [
  /^pm\s+list\s+packages(\s+[a-zA-Z0-9_.]+)?$/i,
  /^pm\s+grant\s+[a-zA-Z0-9_.]+\s+[a-zA-Z0-9_.]+$/i,
  /^pm\s+clear\s+[a-zA-Z0-9_.]+$/i,
  /^am\s+start\b.+$/i,
  /^am\s+force-stop\s+[a-zA-Z0-9_.]+$/i,
  /^monkey\s+-p\s+[a-zA-Z0-9_.]+\s+-c\s+android\.intent\.category\.launcher\s+1$/i,
  /^svc\s+(wifi|data)\s+(enable|disable)$/i,
  /^settings\s+put\s+(global|system)\s+[a-zA-Z0-9_.]+\s+[a-zA-Z0-9_.-]+$/i,
  /^settings\s+get\s+(global|system)\s+[a-zA-Z0-9_.]+$/i,
  /^dumpsys\s+battery$/i,
  /^dumpsys\s+battery\s+set\s+(level|status|plugged)\s+\d+$/i,
  /^dumpsys\s+battery\s+reset$/i,
  /^getprop(\s+[a-zA-Z0-9_.]+)?$/i,
  /^setprop\s+persist\.sys\.(locale|language|country)\s+[a-zA-Z0-9_-]+$/i,
  /^rm\s+\/sdcard\/mcp_record_\d+\.mp4$/i,
  /^input\s+(keyevent|tap|swipe|text)\b.*$/i,
];

const ALLOWED_COMMAND_DESCRIPTIONS = [
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
  "input keyevent|tap|swipe|text ...",
] as const;

export function getAllowedAdbShellCommands() {
  return [...ALLOWED_COMMAND_DESCRIPTIONS];
}

function normalizeCommand(command: string): string {
  return command.trim().replace(/\s+/g, " ");
}

export function isSafeModeEnabled() {
  const value = process.env.AVD_MCP_SAFE_MODE?.trim().toLowerCase();
  if (value === undefined || value === "") return true;
  return ["1", "true", "yes", "on"].includes(value);
}

export function assertSafeAdbShellCommand(command: string) {
  if (!command || command.trim().length === 0) {
    throw new ToolError({
      code: "INVALID_INPUT",
      message: "command não pode ser vazio.",
    });
  }

  const normalized = normalizeCommand(command);

  if (isSafeModeEnabled()) {
    for (const rule of BLOCKED_PATTERNS) {
      if (rule.pattern.test(normalized)) {
        throw new ToolError({
          code: rule.code,
          message: `Comando bloqueado por safe mode: ${rule.reason}.`,
          technicalDetails: `command=${normalized}`,
        });
      }
    }
  }

  const allowed = ALLOWED_PATTERNS.some((pattern) => pattern.test(normalized));
  if (!allowed) {
    const allowedCommands = getAllowedAdbShellCommands();
    throw new ToolError({
      code: "SHELL_COMMAND_NOT_ALLOWED",
      message: `Comando não permitido em safe mode. Comandos permitidos: ${allowedCommands.join(", ")}`,
      hints: [
        "Use adb_shell apenas para comandos na allowlist.",
      ],
      validOptions: allowedCommands,
      technicalDetails: `command=${normalized}`,
    });
  }
}

export function assertSafeAdbShellArgs(commandParts: string[]) {
  const command = commandParts.join(" ");
  assertSafeAdbShellCommand(command);
}
