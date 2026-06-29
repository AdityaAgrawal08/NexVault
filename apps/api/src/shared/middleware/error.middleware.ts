import type {
  ErrorRequestHandler,
} from "express";

import { ZodError } from "zod";

import { AppError } from "../errors/app-error";

export const errorMiddleware: ErrorRequestHandler = (
  error,
  _req,
  res,
  _next,
) => {
  if (error instanceof ZodError) {
    return res.status(400).json({
      message: "Validation failed.",
      errors: error.flatten(),
    });
  }

  if (error instanceof AppError) {
    return res.status(error.statusCode).json({
      message: error.message,
      code: error.code,
    });
  }

  console.error(error);

  return res.status(500).json({
    message: "Internal server error.",
    code: "INTERNAL_SERVER_ERROR",
  });
};
