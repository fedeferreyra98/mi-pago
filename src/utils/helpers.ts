/**
 * Utility helper functions for common operations
 */

/**
 * Calculate days between two dates
 */
export function daysBetween(date1: Date, date2: Date): number {
  const millisecondsPerDay = 24 * 60 * 60 * 1000;
  return Math.floor((date2.getTime() - date1.getTime()) / millisecondsPerDay);
}

/**
 * Check if date has passed (is in the past)
 */
export function hasDatePassed(date: Date): boolean {
  return date < new Date();
}

/**
 * Add days to a date
 */
export function addDaysToDate(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

/**
 * Add months to a date
 */
export function addMonthsToDate(date: Date, months: number): Date {
  const result = new Date(date);
  result.setMonth(result.getMonth() + months);
  return result;
}

/**
 * Format currency amount
 */
export function formatCurrency(amount: number, currency: string = 'ARS'): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency,
  }).format(amount);
}

/**
 * Round to 2 decimal places
 */
export function roundToTwoDecimals(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Calculate percentage of a value
 */
export function calculatePercentage(value: number, percentage: number): number {
  return roundToTwoDecimals((value * percentage) / 100);
}

/**
 * Calculate simple interest
 */
export function calculateSimpleInterest(principal: number, rate: number, time: number): number {
  return roundToTwoDecimals((principal * rate * time) / 100);
}

/**
 * Calculate compound interest
 */
export function calculateCompoundInterest(
  principal: number,
  rate: number,
  time: number,
  compoundFrequency: number = 12
): number {
  const amount = principal * Math.pow(1 + rate / (100 * compoundFrequency), compoundFrequency * time);
  return roundToTwoDecimals(amount - principal);
}

/**
 * Generate unique transaction ID
 */
export function generateTransactionId(): string {
  return `TXN-${Date.now()}-${Math.random().toString(36).substring(2, 9).toUpperCase()}`;
}

/**
 * Validate email format
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validate UUID format
 */
export function isValidUUID(uuid: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}

/**
 * Calculate debt-to-income ratio
 */
export function calculateDebtToIncomeRatio(monthlyDebt: number, monthlyIncome: number): number {
  if (monthlyIncome === 0) return 0;
  return roundToTwoDecimals((monthlyDebt / monthlyIncome) * 100);
}

/**
 * Determine credit score category
 */
export function getScoreCategory(score: number): string {
  if (score >= 800) return 'Excellent';
  if (score >= 700) return 'Very Good';
  if (score >= 600) return 'Good';
  if (score >= 500) return 'Fair';
  return 'Poor';
}

/**
 * Paginate array results
 */
export function paginate<T>(
  items: T[],
  page: number = 1,
  pageSize: number = 10
): { data: T[]; total: number; page: number; pageSize: number; totalPages: number } {
  const total = items.length;
  const totalPages = Math.ceil(total / pageSize);
  const start = (page - 1) * pageSize;
  const end = start + pageSize;

  return {
    data: items.slice(start, end),
    total,
    page,
    pageSize,
    totalPages,
  };
}

/**
 * Mask sensitive data (for logging)
 */
export function maskSensitiveData(data: string, visibleChars: number = 4): string {
  if (data.length <= visibleChars) return '****';
  return data.substring(0, visibleChars) + '*'.repeat(data.length - visibleChars);
}

/**
 * Deep merge objects
 */
export function deepMerge<T extends Record<string, any>>(target: T, source: Partial<T>): T {
  const result = { ...target };

  for (const key in source) {
    if (source.hasOwnProperty(key)) {
      if (typeof source[key] === 'object' && source[key] !== null && !Array.isArray(source[key])) {
        result[key] = deepMerge(target[key] as any, source[key] as any);
      } else {
        result[key] = source[key] as any;
      }
    }
  }

  return result;
}

/**
 * Retry async operation with exponential backoff
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  initialDelayMs: number = 1000
): Promise<T> {
  let lastError: Error | null = null;

  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      if (i < maxRetries - 1) {
        const delayMs = initialDelayMs * Math.pow(2, i);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }

  throw lastError;
}

/**
 * Format date to ISO string with timezone
 */
export function formatDateWithTimezone(date: Date): string {
  return date.toLocaleString('es-AR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZone: 'America/Argentina/Buenos_Aires',
  });
}
