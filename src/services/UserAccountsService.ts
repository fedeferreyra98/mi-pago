import { UserAccount } from '@/types/index.js';
import UserAccountsRepository from '@/repositories/UserAccountsRepository.js';
import { NotFoundError, ValidationError } from '@/errors/AppError.js';

export class UserAccountsService {
  private userAccountsRepository = UserAccountsRepository;

  async getUserAccount(userId: string): Promise<UserAccount> {
    const account = await this.userAccountsRepository.findByUserId(userId);
    if (!account) {
      throw new NotFoundError(`User account ${userId} not found`);
    }
    return account;
  }

  async createUserAccount(userId: string): Promise<UserAccount> {
    // Check if account already exists
    const existingAccount = await this.userAccountsRepository.findByUserId(userId);
    if (existingAccount) {
      throw new ValidationError(`User account ${userId} already exists`);
    }

    return this.userAccountsRepository.create({
      usuario_id: userId,
      kyc_completo: false,
      fecha_registro: new Date(),
      saldo_disponible: 0,
      ingresos_declarados: null,
      historial_mora: false,
      score_externo: null,
    });
  }

  async updateAccountBalance(userId: string, amount: number): Promise<UserAccount> {
    const account = await this.getUserAccount(userId);

    if (amount < 0) {
      throw new ValidationError('Balance amount cannot be negative');
    }

    return this.userAccountsRepository.updateBalance(userId, amount);
  }

  async addFunds(userId: string, amount: number): Promise<UserAccount> {
    const account = await this.getUserAccount(userId);

    if (amount <= 0) {
      throw new ValidationError('Amount to add must be greater than 0');
    }

    const newBalance = account.saldo_disponible + amount;
    return this.userAccountsRepository.updateBalance(userId, newBalance);
  }

  async removeFunds(userId: string, amount: number): Promise<UserAccount> {
    const account = await this.getUserAccount(userId);

    if (amount <= 0) {
      throw new ValidationError('Amount to remove must be greater than 0');
    }

    if (account.saldo_disponible < amount) {
      throw new ValidationError(
        `Insufficient balance. Available: ${account.saldo_disponible}, Required: ${amount}`
      );
    }

    const newBalance = account.saldo_disponible - amount;
    return this.userAccountsRepository.updateBalance(userId, newBalance);
  }

  async getBalance(userId: string): Promise<number> {
    return this.userAccountsRepository.getBalance(userId);
  }

  async completeKYC(userId: string): Promise<UserAccount> {
    return this.userAccountsRepository.update(userId, {
      kyc_completo: true,
    });
  }

  async declareIncome(userId: string, income: number): Promise<UserAccount> {
    if (income <= 0) {
      throw new ValidationError('Income must be greater than 0');
    }

    return this.userAccountsRepository.update(userId, {
      ingresos_declarados: income,
    });
  }

  async setExternalScore(userId: string, score: number): Promise<UserAccount> {
    if (score < 0 || score > 100) {
      throw new ValidationError('Score must be between 0 and 100');
    }

    return this.userAccountsRepository.update(userId, {
      score_externo: score,
    });
  }

  async markAsDefaulter(userId: string): Promise<UserAccount> {
    return this.userAccountsRepository.update(userId, {
      historial_mora: true,
    });
  }

  async verifyEligibilityRequirements(userId: string): Promise<{
    kycCompleted: boolean;
    accountAgeDays: number;
    hasDefaultHistory: boolean;
    balance: number;
  }> {
    const account = await this.getUserAccount(userId);

    const accountAgeDays = Math.floor(
      (Date.now() - new Date(account.fecha_registro).getTime()) / (1000 * 60 * 60 * 24)
    );

    return {
      kycCompleted: account.kyc_completo,
      accountAgeDays,
      hasDefaultHistory: account.historial_mora,
      balance: account.saldo_disponible,
    };
  }
}

export default new UserAccountsService();
