import { Request, Response, NextFunction } from 'express';
import { AppError } from '@/errors/AppError.js';

/**
 * Global error handling middleware
 */
export const errorHandler = (err: any, req: Request, res: Response, next: NextFunction): void => {
  console.error('Error:', err);

  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      exito: false,
      error: err.message,
      code: err.code,
      ...(err instanceof Error && { details: err.message }),
    });
  } else if (err instanceof SyntaxError) {
    res.status(400).json({
      exito: false,
      error: 'Invalid JSON',
      code: 'INVALID_JSON',
    });
  } else {
    res.status(500).json({
      exito: false,
      error: 'Internal server error',
      code: 'INTERNAL_ERROR',
      ...(process.env.NODE_ENV === 'development' && { details: err.message }),
    });
  }
};

/**
 * 404 handler
 */
export const notFoundHandler = (req: Request, res: Response, next: NextFunction): void => {
  res.status(404).json({
    exito: false,
    error: `Route not found: ${req.method} ${req.path}`,
    code: 'NOT_FOUND',
  });
};
