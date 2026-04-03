// src/modules/auth/auth.service.ts
import bcrypt from 'bcryptjs';
import { prisma } from '../../utils/prisma';
import { AppError } from '../../utils/response';
import {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
  getRefreshTokenExpiry,
  JwtPayload,
} from '../../utils/jwt';
import { UserRole } from '@prisma/client';

export interface LoginDto {
  email: string;
  password: string;
}

export interface RegisterGarageDto {
  email: string;
  password: string;
  name: string;
  phone: string;
  address?: string;
  contactPerson?: string;
}

export interface RegisterSupplierDto {
  email: string;
  password: string;
  name: string;
  phone: string;
  address?: string;
  contactPerson?: string;
}

const buildPayload = async (userId: string, role: UserRole): Promise<JwtPayload> => {
  const payload: JwtPayload = { userId, role };

  if (role === UserRole.GARAGE) {
    const garage = await prisma.garage.findUnique({ where: { userId } });
    if (garage) payload.garageId = garage.id;
  } else if (role === UserRole.SUPPLIER) {
    const supplier = await prisma.supplier.findUnique({ where: { userId } });
    if (supplier) payload.supplierId = supplier.id;
  }

  return payload;
};

export const login = async (dto: LoginDto) => {
  const user = await prisma.user.findUnique({ where: { email: dto.email } });
  if (!user || !user.isActive) {
    throw new AppError('Invalid email or password', 401);
  }

  const passwordMatch = await bcrypt.compare(dto.password, user.passwordHash);
  if (!passwordMatch) {
    throw new AppError('Invalid email or password', 401);
  }

  const payload = await buildPayload(user.id, user.role);
  const accessToken = generateAccessToken(payload);
  const refreshToken = generateRefreshToken(payload);

  // Persist refresh token
  await prisma.refreshToken.create({
    data: {
      token: refreshToken,
      userId: user.id,
      expiresAt: getRefreshTokenExpiry(),
    },
  });

  return {
    accessToken,
    refreshToken,
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      garageId: payload.garageId,
      supplierId: payload.supplierId,
    },
  };
};

export const refresh = async (token: string) => {
  // Verify JWT signature
  let decoded: JwtPayload;
  try {
    decoded = verifyRefreshToken(token);
  } catch {
    throw new AppError('Invalid refresh token', 401);
  }

  // Atomic delete (rotation protection)
  const deleted = await prisma.refreshToken.deleteMany({
    where: {
      token,
      expiresAt: { gt: new Date() }, // also check expiry here
    },
  });

  if (deleted.count === 0) {
    throw new AppError('Refresh token expired or already used', 401);
  }

  const payload = await buildPayload(decoded.userId, decoded.role);
  const accessToken = generateAccessToken(payload);
  const newRefreshToken = generateRefreshToken(payload);

  await prisma.refreshToken.create({
    data: {
      token: newRefreshToken,
      userId: decoded.userId,
      expiresAt: getRefreshTokenExpiry(),
    },
  });

  return { accessToken, refreshToken: newRefreshToken };
};

export const logout = async (token: string) => {
  await prisma.refreshToken.deleteMany({ where: { token } });
};

export const registerGarage = async (dto: RegisterGarageDto) => {
  const existing = await prisma.user.findUnique({ where: { email: dto.email } });
  if (existing) throw new AppError('Email already registered', 409);

  const passwordHash = await bcrypt.hash(dto.password, 10);

  const user = await prisma.user.create({
    data: {
      email: dto.email,
      passwordHash,
      role: UserRole.GARAGE,
      garage: {
        create: {
          name: dto.name,
          phone: dto.phone,
          address: dto.address,
          contactPerson: dto.contactPerson,
        },
      },
    },
    include: { garage: true },
  });

  return {
    id: user.id,
    email: user.email,
    role: user.role,
    garage: user.garage,
  };
};

export const registerSupplier = async (dto: RegisterSupplierDto) => {
  const existing = await prisma.user.findUnique({ where: { email: dto.email } });
  if (existing) throw new AppError('Email already registered', 409);

  const passwordHash = await bcrypt.hash(dto.password, 10);

  const user = await prisma.user.create({
    data: {
      email: dto.email,
      passwordHash,
      role: UserRole.SUPPLIER,
      supplier: {
        create: {
          name: dto.name,
          phone: dto.phone,
          address: dto.address,
          contactPerson: dto.contactPerson,
        },
      },
    },
    include: { supplier: true },
  });

  return {
    id: user.id,
    email: user.email,
    role: user.role,
    supplier: user.supplier,
  };
};
