import { ToolError } from "../shared/errors/tool-error.js";
import { isAbsolute, relative, resolve, sep } from "node:path";

const PACKAGE_NAME_PATTERN = /^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z0-9_]+)+$/;
const PERMISSION_PATTERN = /^[a-zA-Z0-9_.]+$/;
const ACTIVITY_PATTERN = /^[a-zA-Z0-9_.$/]+$/;

export function assertSafePackageName(packageName: string) {
  if (!PACKAGE_NAME_PATTERN.test(packageName)) {
    throw new ToolError({
      code: "INVALID_INPUT",
      message: "packageName inválido.",
      technicalDetails: `packageName=${packageName}`,
    });
  }
}

export function assertSafeActivity(activity: string) {
  if (!ACTIVITY_PATTERN.test(activity)) {
    throw new ToolError({
      code: "INVALID_INPUT",
      message: "activity inválida.",
      technicalDetails: `activity=${activity}`,
    });
  }
}

export function assertSafePermissions(permissions: string[]) {
  if (!Array.isArray(permissions) || permissions.length === 0) {
    throw new ToolError({
      code: "INVALID_INPUT",
      message: "permissions deve conter ao menos uma permissão.",
    });
  }

  for (const permission of permissions) {
    if (!PERMISSION_PATTERN.test(permission)) {
      throw new ToolError({
        code: "INVALID_INPUT",
        message: "Permissão inválida em permissions.",
        technicalDetails: `permission=${permission}`,
      });
    }
  }
}

export function assertSafeUri(uri: string) {
  try {
    const parsed = new URL(uri);
    if (!parsed.protocol) {
      throw new Error("uri sem protocolo");
    }
  } catch {
    throw new ToolError({
      code: "INVALID_INPUT",
      message: "uri inválida.",
      technicalDetails: `uri=${uri}`,
    });
  }
}

export function assertSafeCliCommand(command: string, fieldName = "command") {
  if (!command || command.trim().length === 0) {
    throw new ToolError({
      code: "INVALID_INPUT",
      message: `${fieldName} não pode ser vazio.`,
    });
  }

  if (/[\r\n\u0000]/.test(command)) {
    throw new ToolError({
      code: "INVALID_INPUT",
      message: `${fieldName} contém caracteres inválidos.`,
      technicalDetails: `${fieldName}=${command}`,
    });
  }
}

export function assertPathInsideWorkspace(pathValue: string, fieldName = "path") {
  if (!pathValue || pathValue.trim().length === 0) {
    throw new ToolError({
      code: "INVALID_INPUT",
      message: `${fieldName} não pode ser vazio.`,
    });
  }

  if (/[\r\n\u0000]/.test(pathValue)) {
    throw new ToolError({
      code: "INVALID_INPUT",
      message: `${fieldName} contém caracteres inválidos.`,
      technicalDetails: `${fieldName}=${pathValue}`,
    });
  }

  const baseDir = resolve(process.env.AVD_MCP_WORKSPACE_DIR ?? process.cwd());
  const targetPath = isAbsolute(pathValue)
    ? resolve(pathValue)
    : resolve(baseDir, pathValue);

  const relativePath = relative(baseDir, targetPath);
  const isOutsideBase =
    relativePath === ".." ||
    relativePath.startsWith(`..${sep}`) ||
    (relativePath.length > 0 && isAbsolute(relativePath));

  if (isOutsideBase) {
    throw new ToolError({
      code: "INVALID_PATH",
      message: `${fieldName} fora da pasta base permitida.`,
      technicalDetails: `baseDir=${baseDir}; ${fieldName}=${targetPath}`,
    });
  }
}
