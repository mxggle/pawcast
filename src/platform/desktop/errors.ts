export interface DesktopErrorShape {
  code: string;
  message: string;
  operation?: string;
  retryable: boolean;
}

export class DesktopError extends Error implements DesktopErrorShape {
  readonly code: string;
  readonly operation?: string;
  readonly retryable: boolean;

  constructor(shape: DesktopErrorShape) {
    super(shape.message);
    this.name = "DesktopError";
    this.code = shape.code;
    this.operation = shape.operation;
    this.retryable = shape.retryable;
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

export const toDesktopError = (value: unknown): DesktopError => {
  if (value instanceof DesktopError) return value;

  if (isRecord(value) && typeof value.code === "string" && typeof value.message === "string") {
    return new DesktopError({
      code: value.code,
      message: value.message,
      operation: typeof value.operation === "string" ? value.operation : undefined,
      retryable: value.retryable === true,
    });
  }

  return new DesktopError({
    code: "desktop_command_failed",
    message: "The desktop command failed.",
    retryable: false,
  });
};
