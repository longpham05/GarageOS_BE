// src/utils/response.ts
import { Response } from 'express';

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
  errors?: unknown;
  meta?: {
    page?: number;
    limit?: number;
    total?: number;
  };
}

export const sendSuccess = <T>(
  res: Response,
  data: T,
  message?: string,
  statusCode = 200,
  meta?: ApiResponse['meta']
) => {
  const response: ApiResponse<T> = { success: true, data, message, meta };
  return res.status(statusCode).json(response);
};

export const sendError = (
  res: Response,
  message: string,
  statusCode = 400,
  errors?: unknown
) => {
  const response: ApiResponse = { success: false, message, errors };
  return res.status(statusCode).json(response);
};

export class AppError extends Error {
  constructor(
    public message: string,
    public statusCode: number = 400,
    public errors?: unknown
  ) {
    super(message);
    this.name = 'AppError';
  }
}
