import { CreditType, CreditEligibility } from '@/types/index.js';
import { config } from '@/config/config.js';
import UserAccountsRepository from '@/repositories/UserAccountsRepository.js';
import CreditsRepository from '@/repositories/CreditsRepository.js';
import CreditsService from './CreditsService.js';

export class CreditsValidator {
  private userAccountsRepository = UserAccountsRepository;
  private creditsRepository = CreditsRepository;
  private creditsService = CreditsService;

  async validateQuickCreditEligibility(userId: string): Promise<CreditEligibility> {
    try {
      // Check KYC completion
      const kycCompleted = await this.userAccountsRepository.checkKYCStatus(userId);
      if (!kycCompleted) {
        return {
          es_elegible: false,
          razon_rechazo: 'KYC not completed',
        };
      }

      // Check account age (>30 days)
      const accountAge = await this.userAccountsRepository.getAccountAge(userId);
      if (accountAge < 30) {
        return {
          es_elegible: false,
          razon_rechazo: `Account must be at least 30 days old. Current age: ${accountAge} days`,
        };
      }

      // Check default history
      const hasDefaultHistory = await this.userAccountsRepository.hasDefaultHistory(userId);
      if (hasDefaultHistory) {
        return {
          es_elegible: false,
          razon_rechazo: 'User has default history',
        };
      }

      // Check debt-to-income ratio (<=40%)
      const debtToIncome = await this.creditsService.getDebtToIncomeRatio(userId);
      if (debtToIncome > 40) {
        return {
          es_elegible: false,
          razon_rechazo: `Debt-to-income ratio exceeds 40%. Current ratio: ${debtToIncome.toFixed(2)}%`,
        };
      }

      return {
        es_elegible: true,
        limites_maximos: {
          monto_maximo: config.credits.quickCreditMaxAmount,
        },
      };
    } catch (error) {
      return {
        es_elegible: false,
        razon_rechazo: `Eligibility check failed: ${error}`,
      };
    }
  }

  async validateNormalCreditEligibility(userId: string): Promise<CreditEligibility> {
    try {
      // Check KYC completion
      const kycCompleted = await this.userAccountsRepository.checkKYCStatus(userId);
      if (!kycCompleted) {
        return {
          es_elegible: false,
          razon_rechazo: 'KYC not completed',
        };
      }

      // Check declared income
      const income = await this.userAccountsRepository.getDeclaredIncome(userId);
      if (!income || income <= 0) {
        return {
          es_elegible: false,
          razon_rechazo: 'Income not declared or invalid',
        };
      }

      // Check default history
      const hasDefaultHistory = await this.userAccountsRepository.hasDefaultHistory(userId);
      if (hasDefaultHistory) {
        return {
          es_elegible: false,
          razon_rechazo: 'User has default history',
        };
      }

      // Check for active unpaid credits
      const activeCredits = await this.creditsRepository.getActiveCreditsByUser(userId);
      const hasUnpaidCredits = activeCredits.some(
        (credit) => credit.estado === 'en_mora' || credit.estado === 'en_curso'
      );
      if (hasUnpaidCredits) {
        return {
          es_elegible: false,
          razon_rechazo: 'User has unpaid credits',
        };
      }

      // Check external scoring (mock: pass if score >= 50)
      const externalScore = await this.userAccountsRepository.getExternalScore(userId);
      if (config.features.enableExternalScoring && (!externalScore || externalScore < 50)) {
        return {
          es_elegible: false,
          razon_rechazo: `External score below threshold. Current score: ${externalScore || 0}`,
        };
      }

      return {
        es_elegible: true,
        limites_maximos: {
          monto_maximo: config.credits.normalCreditMaxAmount,
          plazo_minimo: 3,
          plazo_maximo: 12,
        },
      };
    } catch (error) {
      return {
        es_elegible: false,
        razon_rechazo: `Eligibility check failed: ${error}`,
      };
    }
  }

  async validateAmount(userId: string, amount: number, creditType: CreditType): Promise<CreditEligibility> {
    const maxAmount = creditType === CreditType.QUICK
      ? config.credits.quickCreditMaxAmount
      : config.credits.normalCreditMaxAmount;

    if (amount <= 0) {
      return {
        es_elegible: false,
        razon_rechazo: 'Amount must be greater than 0',
      };
    }

    if (amount > maxAmount) {
      return {
        es_elegible: false,
        razon_rechazo: `Amount exceeds maximum of ${maxAmount}`,
        limites_maximos: {
          monto_maximo: maxAmount,
        },
      };
    }

    return {
      es_elegible: true,
    };
  }

  async validateTerm(termValue: number, creditType: CreditType): Promise<CreditEligibility> {
    if (creditType === CreditType.QUICK) {
      if (![30, 60, 90].includes(termValue)) {
        return {
          es_elegible: false,
          razon_rechazo: 'Quick credit terms must be 30, 60, or 90 days',
        };
      }
    } else {
      if (![3, 6, 9, 12].includes(termValue)) {
        return {
          es_elegible: false,
          razon_rechazo: 'Normal credit terms must be 3, 6, 9, or 12 months',
        };
      }
    }

    return {
      es_elegible: true,
    };
  }
}

export default new CreditsValidator();
