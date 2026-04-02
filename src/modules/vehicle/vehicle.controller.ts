// src/modules/vehicle/vehicle.controller.ts
import { Request, Response, NextFunction } from 'express';
import * as vehicleService from './vehicle.service';
import { sendSuccess } from '../../utils/response';

export const createVehicle = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const garageId = req.user?.garageId;
    const result = await vehicleService.createVehicle({ ...req.body, garageId });
    sendSuccess(res, result, 'Vehicle created', 201);
  } catch (err) {
    next(err);
  }
};

export const getVehicle = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await vehicleService.getVehicle(req.params.id);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
};

export const getVehicleByPlate = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await vehicleService.getVehicleByPlate(req.params.plate);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
};

export const listVehicles = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Garages only see their own vehicles; admin sees all
    const garageId = req.user?.role === 'GARAGE' ? req.user.garageId : undefined;
    const result = await vehicleService.listVehicles(garageId);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
};

export const updateVehicle = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await vehicleService.updateVehicle(req.params.id, req.body);
    sendSuccess(res, result, 'Vehicle updated');
  } catch (err) {
    next(err);
  }
};
