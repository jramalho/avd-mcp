export type ToolErrorOptions = {
  code: string;
  message: string;
  technicalDetails?: string;
  cause?: unknown;
};

export class ToolError extends Error {
  readonly code: string;
  readonly technicalDetails: string | undefined;

  constructor(options: ToolErrorOptions) {
    super(options.message, { cause: options.cause });
    this.name = "ToolError";
    this.code = options.code;
    this.technicalDetails = options.technicalDetails;
  }
}

export function toToolError(error: unknown, fallbackMessage: string): ToolError {
  if (error instanceof ToolError) {
    return error;
  }

  if (error instanceof Error) {
    return new ToolError({
      code: "UNEXPECTED_ERROR",
      message: fallbackMessage,
      technicalDetails: `${error.name}: ${error.message}`,
      cause: error,
    });
  }

  return new ToolError({
    code: "UNEXPECTED_ERROR",
    message: fallbackMessage,
    technicalDetails: String(error),
    cause: error,
  });
}
