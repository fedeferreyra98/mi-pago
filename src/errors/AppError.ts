export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public code: string = 'INTERNAL_ERROR'
  ) {
    super(message);
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(400, message, 'VALIDATION_ERROR');
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}

export class NotFoundError extends AppError {
  constructor(message: string) {
    super(404, message, 'NOT_FOUND');
    Object.setPrototypeOf(this, NotFoundError.prototype);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message: string = 'Unauthorized') {
    super(401, message, 'UNAUTHORIZED');
    Object.setPrototypeOf(this, UnauthorizedError.prototype);
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string = 'Forbidden') {
    super(403, message, 'FORBIDDEN');
    Object.setPrototypeOf(this, ForbiddenError.prototype);
  }
}

export class CreditEligibilityError extends AppError {
  constructor(message: string, public reason: string) {
    super(400, message, 'CREDIT_ELIGIBILITY_ERROR');
    Object.setPrototypeOf(this, CreditEligibilityError.prototype);
  }
}

export class InsufficientFundsError extends AppError {
  constructor(message: string = 'Insufficient funds available') {
    super(400, message, 'INSUFFICIENT_FUNDS');
    Object.setPrototypeOf(this, InsufficientFundsError.prototype);
  }
}

export class DatabaseError extends AppError {
  constructor(message: string) {
    super(500, message, 'DATABASE_ERROR');
    Object.setPrototypeOf(this, DatabaseError.prototype);
  }
}

export class ExternalServiceError extends AppError {
  constructor(message: string, public service: string) {
    super(503, message, 'EXTERNAL_SERVICE_ERROR');
    Object.setPrototypeOf(this, ExternalServiceError.prototype);
  }
}
