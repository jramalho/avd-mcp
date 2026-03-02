import { ToolError } from "../shared/errors/tool-error.js";

const BLOCKED_PATTERNS: Array<{ code: string; pattern: RegExp; reason: string }> = [
  {
    code: "SHELL_COMMAND_BLOCKED",
    pattern: /(^|\s)reboot(\s|$)/i,
    reason: "comando reboot bloqueado",
  },
  {
    code: "SHELL_COMMAND_BLOCKED",
    pattern: /rm\s+-rf\s+\//i,
    reason: "comando destrutivo bloqueado",
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

export function assertSafeAdbShellCommand(command: string) {
  if (!command || command.trim().length === 0) {
    throw new ToolError({
      code: "INVALID_INPUT",
      message: "command não pode ser vazio.",
    });
  }

  for (const rule of BLOCKED_PATTERNS) {
    if (rule.pattern.test(command)) {
      throw new ToolError({
        code: rule.code,
        message: `Comando bloqueado por safe mode: ${rule.reason}.`,
        technicalDetails: `command=${command}`,
      });
    }
  }
}
