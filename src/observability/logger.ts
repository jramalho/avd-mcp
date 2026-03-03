export type StructuredLogInput = {
  traceId: string;
  tool: string;
  message: string;
  data?: Record<string, unknown>;
};

type Level = "info" | "warn" | "error";

function isJsonLogsEnabled(): boolean {
  const value = process.env.AVD_MCP_JSON_LOGS?.trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes" || value === "on";
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return JSON.stringify({ serializationError: true });
  }
}

function formatHuman(level: Level, input: StructuredLogInput): string {
  const base = `${new Date().toISOString()} [${level.toUpperCase()}] tool=${input.tool} traceId=${input.traceId} message=${input.message}`;
  if (!input.data) return base;
  return `${base} data=${safeStringify(input.data)}`;
}

function formatJson(level: Level, input: StructuredLogInput): string {
  return safeStringify({
    timestamp: new Date().toISOString(),
    level,
    traceId: input.traceId,
    tool: input.tool,
    message: input.message,
    ...(input.data ? { data: input.data } : {}),
  });
}

function write(level: Level, input: StructuredLogInput) {
  const line = isJsonLogsEnabled()
    ? formatJson(level, input)
    : formatHuman(level, input);

  if (level === "error" || level === "warn") {
    console.error(line);
    return;
  }

  console.log(line);
}

export function logInfo(input: StructuredLogInput) {
  write("info", input);
}

export function logWarn(input: StructuredLogInput) {
  write("warn", input);
}

export function logError(input: StructuredLogInput) {
  write("error", input);
}
