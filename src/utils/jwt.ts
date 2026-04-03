// src/utils/jwt.ts
const jwt = require('jsonwebtoken');
import { randomUUID } from 'crypto';
import { UserRole } from '@prisma/client';

export interface JwtPayload {
  userId: string;
  role: UserRole;
  // role-specific entity id
  garageId?: string;
  supplierId?: string;
}

export const generateAccessToken = (payload: JwtPayload): string => {
  return jwt.sign(payload, process.env.JWT_ACCESS_SECRET as string, {
    expiresIn: (process.env.JWT_ACCESS_EXPIRES_IN as string) || '15m',
  });
};

export const generateRefreshToken = (payload: JwtPayload): string => {
  const payloadWithJti = {
    ...payload,
    jti: randomUUID(), // ensures every token is unique
  };
  return jwt.sign(payloadWithJti, process.env.JWT_REFRESH_SECRET as string, {
    expiresIn: (process.env.JWT_REFRESH_EXPIRES_IN as string) || '7d',
  });
};

export const verifyAccessToken = (token: string): JwtPayload => {
  return jwt.verify(token, process.env.JWT_ACCESS_SECRET as string) as JwtPayload;
};

export const verifyRefreshToken = (token: string): JwtPayload => {
  return jwt.verify(token, process.env.JWT_REFRESH_SECRET as string) as JwtPayload;
};

export const getRefreshTokenExpiry = (): Date => {
  const days = parseInt(process.env.JWT_REFRESH_EXPIRES_IN?.replace('d', '') || '7');
  const expiry = new Date();
  expiry.setDate(expiry.getDate() + days);
  return expiry;
};
