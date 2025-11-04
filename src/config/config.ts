import dotenv from 'dotenv';

dotenv.config();

export const config = {
  server: {
    port: parseInt(process.env.PORT || '3000', 10),
    nodeEnv: process.env.NODE_ENV || 'development',
  },
  supabase: {
    url: process.env.SUPABASE_URL || '',
    key: process.env.SUPABASE_KEY || '',
  },
  jwt: {
    secret: process.env.JWT_SECRET || 'your-secret-key',
    expiresIn: process.env.JWT_EXPIRATION || '24h',
  },
  credits: {
    quickCreditMaxAmount: parseInt(process.env.QUICK_CREDIT_MAX_AMOUNT || '50000', 10),
    normalCreditMaxAmount: parseInt(process.env.NORMAL_CREDIT_MAX_AMOUNT || '250000', 10),
    quickCreditInterestMarkup: parseInt(process.env.QUICK_CREDIT_INTEREST_MARKUP || '15', 10),
    normalCreditInterestMarkup: parseInt(process.env.NORMAL_CREDIT_INTEREST_MARKUP || '-10', 10),
    marketPagoBaseTEA: parseInt(process.env.MARKET_PAGO_BASE_TEA || '100', 10),
  },
  features: {
    enableExternalScoring: process.env.ENABLE_EXTERNAL_SCORING === 'true',
  },
};
