export type LogLevel = "debug" | "info" | "warn" | "error";

export type LogContext = Record<string, unknown>;

function safeJson(value: unknown) {
  try {
    return JSON.stringify(value);
  } catch {
    return JSON.stringify({ serializationError: true });
  }
}

export class Logger {
  constructor(private readonly serviceName: string) {}

  debug(message: string, context: LogContext = {}) {
    this.log("debug", message, context);
  }

  info(message: string, context: LogContext = {}) {
    this.log("info", message, context);
  }

  warn(message: string, context: LogContext = {}) {
    this.log("warn", message, context);
  }

  error(message: string, context: LogContext = {}) {
    this.log("error", message, context);
  }

  private log(level: LogLevel, message: string, context: LogContext) {
    const payload = {
      timestamp: new Date().toISOString(),
      level,
      service: this.serviceName,
      message,
      ...context,
    };

    const line = safeJson(payload);
    if (level === "error" || level === "warn") {
      console.error(line);
      return;
    }

    console.log(line);
  }
}
