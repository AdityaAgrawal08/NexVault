import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";
import { AppError } from "../errors/app-error";
import { metricsService } from "../../core/monitoring/metrics.service";

export const errorMiddleware: ErrorRequestHandler = (
  error,
  _req,
  res,
  _next,
) => {
  metricsService.incrementErrors();
  if (error instanceof ZodError) {
    return res.status(400).json({
      message: "Validation failed.",
      errors: error.flatten().fieldErrors,
    });
  }

  if (error instanceof AppError) {
    return res.status(error.statusCode).json({
      message: error.message,
      code: error.code,
      ...(error.errors && {
        errors: error.errors,
      }),
    });
  }

  console.error(error);

  return res.status(500).json({
    message: "Internal server error.",
    code: "INTERNAL_SERVER_ERROR",
  });
};
