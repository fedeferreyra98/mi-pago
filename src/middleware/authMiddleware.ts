import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '@/config/config.js';
import { UnauthorizedError } from '@/errors/AppError.js';

export interface AuthenticatedRequest extends Request {
  usuario_id?: string;
  user?: any;
}

/**
 * Middleware to verify JWT token
 */
export const verifyToken = (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
  try {
    const token = req.headers.authorization?.split(' ')[1];

    if (!token) {
      throw new UnauthorizedError('No token provided');
    }

    const decoded = jwt.verify(token, config.jwt.secret) as any;
    req.usuario_id = decoded.usuario_id;
    req.user = decoded;

    next();
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      res.status(401).json({
        exito: false,
        error: error.message,
        code: error.code,
      });
    } else {
      res.status(401).json({
        exito: false,
        error: 'Invalid token',
        code: 'INVALID_TOKEN',
      });
    }
  }
};

/**
 * Generate JWT token
 */
export const generateToken = (usuarioId: string, expiresIn: string = config.jwt.expiresIn): string => {
  return jwt.sign(
    {
      usuario_id: usuarioId,
    },
    config.jwt.secret,
    { expiresIn }
  );
};

/**
 * Optional authentication - sets usuario_id if token exists, doesn't fail if missing
 */
export const optionalAuth = (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
  try {
    const token = req.headers.authorization?.split(' ')[1];

    if (token) {
      const decoded = jwt.verify(token, config.jwt.secret) as any;
      req.usuario_id = decoded.usuario_id;
      req.user = decoded;
    }

    next();
  } catch (error) {
    // If token is invalid, just continue without authentication
    next();
  }
};
