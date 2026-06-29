export type AppErrorOptions = {
  message: string;
  statusCode: number;
  code: string;
  expose?: boolean;
  cause?: unknown;
};

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly expose: boolean;

  constructor({
    message,
    statusCode,
    code,
    expose = true,
    cause,
  }: AppErrorOptions) {
    super(message, { cause });

    this.name = new.target.name;

    this.statusCode = statusCode;
    this.code = code;
    this.expose = expose;

    Object.setPrototypeOf(this, new.target.prototype);

    Error.captureStackTrace?.(this, new.target);
  }
}
