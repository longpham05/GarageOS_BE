// src/middleware/errorHandler.ts
import { Request, Response, NextFunction } from 'express';
import { AppError, sendError } from '../utils/response';
import { logger } from '../utils/logger';
import { Prisma } from '@prisma/client';

export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction
): void => {
  logger.error(err.message, { stack: err.stack, path: req.path, method: req.method });

  // Known application errors
  if (err instanceof AppError) {
    sendError(res, err.message, err.statusCode, err.errors);
    return;
  }

  // Prisma unique constraint violation
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      sendError(res, 'A record with this value already exists', 409);
      return;
    }
    if (err.code === 'P2025') {
      sendError(res, 'Record not found', 404);
      return;
    }
  }

  // Fallback
  sendError(res, 'Internal server error', 500);
};

export const notFoundHandler = (req: Request, res: Response): void => {
  sendError(res, `Route ${req.method} ${req.path} not found`, 404);
};
