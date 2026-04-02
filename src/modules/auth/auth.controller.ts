// src/modules/auth/auth.controller.ts
import { Request, Response, NextFunction } from 'express';
import * as authService from './auth.service';
import { sendSuccess } from '../../utils/response';

export const login = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await authService.login(req.body);
    sendSuccess(res, result, 'Login successful');
  } catch (err) {
    next(err);
  }
};

export const refresh = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await authService.refresh(req.body.refreshToken);
    sendSuccess(res, result, 'Tokens refreshed');
  } catch (err) {
    next(err);
  }
};

export const logout = async (req: Request, res: Response, next: NextFunction) => {
  try {
    await authService.logout(req.body.refreshToken);
    sendSuccess(res, null, 'Logged out successfully');
  } catch (err) {
    next(err);
  }
};

export const registerGarage = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await authService.registerGarage(req.body);
    sendSuccess(res, result, 'Garage registered successfully', 201);
  } catch (err) {
    next(err);
  }
};

export const registerSupplier = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await authService.registerSupplier(req.body);
    sendSuccess(res, result, 'Supplier registered successfully', 201);
  } catch (err) {
    next(err);
  }
};

export const me = async (req: Request, res: Response, next: NextFunction) => {
  try {
    sendSuccess(res, req.user, 'Current user');
  } catch (err) {
    next(err);
  }
};
