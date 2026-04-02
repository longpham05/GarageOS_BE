// src/modules/vehicle/vehicle.service.ts
import { prisma } from '../../utils/prisma';
import { AppError } from '../../utils/response';

export interface CreateVehicleDto {
  licensePlate: string;
  brand?: string;
  model?: string;
  year?: number;
  garageId?: string;
}

export interface UpdateVehicleDto {
  brand?: string;
  model?: string;
  year?: number;
}

export const createVehicle = async (dto: CreateVehicleDto) => {
  // Upsert: if plate exists, return existing vehicle (garages often re-submit same car)
  const existing = await prisma.vehicle.findUnique({
    where: { licensePlate: dto.licensePlate },
  });

  if (existing) {
    // Update with any new info if provided
    const updated = await prisma.vehicle.update({
      where: { id: existing.id },
      data: {
        brand: dto.brand ?? existing.brand ?? undefined,
        model: dto.model ?? existing.model ?? undefined,
        year: dto.year ?? existing.year ?? undefined,
        garageId: dto.garageId ?? existing.garageId ?? undefined,
      },
    });
    return updated;
  }

  return prisma.vehicle.create({ data: dto });
};

export const getVehicle = async (id: string) => {
  const vehicle = await prisma.vehicle.findUnique({
    where: { id },
    include: { rfqs: { orderBy: { createdAt: 'desc' }, take: 10 } },
  });
  if (!vehicle) throw new AppError('Vehicle not found', 404);
  return vehicle;
};

export const getVehicleByPlate = async (licensePlate: string) => {
  const vehicle = await prisma.vehicle.findUnique({
    where: { licensePlate },
  });
  if (!vehicle) throw new AppError('Vehicle not found', 404);
  return vehicle;
};

export const listVehicles = async (garageId?: string) => {
  return prisma.vehicle.findMany({
    where: garageId ? { garageId } : {},
    orderBy: { createdAt: 'desc' },
  });
};

export const updateVehicle = async (id: string, dto: UpdateVehicleDto) => {
  const vehicle = await prisma.vehicle.findUnique({ where: { id } });
  if (!vehicle) throw new AppError('Vehicle not found', 404);
  return prisma.vehicle.update({ where: { id }, data: dto });
};
