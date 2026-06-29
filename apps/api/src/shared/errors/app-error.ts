export type ValidationErrors = Record<string, string[]>;

export type AppErrorOptions = {
  message: string;
  statusCode: number;
  code: string;
  errors?: ValidationErrors;
  expose?: boolean;
  cause?: unknown;
};

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly errors?: ValidationErrors;
  public readonly expose: boolean;

  constructor({
    message,
    statusCode,
    code,
    errors,
    expose = true,
    cause,
  }: AppErrorOptions) {
    super(message, { cause });
    this.name = new.target.name;
    this.statusCode = statusCode;
    this.code = code;
    this.expose = expose;

    if (errors !== undefined) {
      this.errors = errors;
    }

    Object.setPrototypeOf(this, new.target.prototype);
    Error.captureStackTrace?.(this, new.target);
  }
}
