import { UserAccount, KYCDocument, KYCStatus, PasswordResetToken } from '@/types/index.js';
import UserAccountsRepository from '@/repositories/UserAccountsRepository.js';
import { NotFoundError, ValidationError, UnauthorizedError } from '@/errors/AppError.js';
import crypto from 'crypto';

export class UserAccountsService {
  private userAccountsRepository = UserAccountsRepository;

  /**
   * Hash password using SHA-256 with salt
   * In production, use bcrypt instead
   */
  private hashPassword(password: string): string {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto
      .pbkdf2Sync(password, salt, 1000, 64, 'sha512')
      .toString('hex');
    return `${salt}.${hash}`;
  }

  /**
   * Verify password against hash
   */
  private verifyPassword(password: string, passwordHash: string): boolean {
    try {
      const [salt, hash] = passwordHash.split('.');
      if (!salt || !hash) return false;

      const hashVerify = crypto
        .pbkdf2Sync(password, salt, 1000, 64, 'sha512')
        .toString('hex');
      return hash === hashVerify;
    } catch (error) {
      return false;
    }
  }

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
      bloqueado: false,
      intentos_fallidos: 0,
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

  // Password and Security Methods
  async validateCredentials(userId: string, password: string): Promise<boolean> {
    try {
      const isBlocked = await this.userAccountsRepository.isAccountBlocked(userId);
      if (isBlocked) {
        throw new ValidationError('Account is temporarily locked. Try again later.');
      }

      const passwordHash = await this.userAccountsRepository.getPasswordHash(userId);
      if (!passwordHash) {
        throw new NotFoundError('Password not found for user');
      }

      const isValid = this.verifyPassword(password, passwordHash);

      if (!isValid) {
        // Record failed login attempt
        await this.userAccountsRepository.recordFailedLoginAttempt(userId);
        throw new UnauthorizedError('Invalid credentials');
      }

      // Reset failed attempts on successful login
      await this.userAccountsRepository.resetFailedLoginAttempts(userId);
      return true;
    } catch (error) {
      if (error instanceof UnauthorizedError) throw error;
      if (error instanceof ValidationError) throw error;
      throw error;
    }
  }

  async updatePassword(userId: string, newPassword: string): Promise<UserAccount> {
    if (!newPassword || newPassword.length < 8) {
      throw new ValidationError('Password must be at least 8 characters long');
    }

    const passwordHash = this.hashPassword(newPassword);
    return this.userAccountsRepository.updatePassword(userId, passwordHash);
  }

  async updatePasswordWithResetToken(token: string, newPassword: string): Promise<UserAccount> {
    if (!newPassword || newPassword.length < 8) {
      throw new ValidationError('Password must be at least 8 characters long');
    }

    const isValidToken = await this.userAccountsRepository.validatePasswordResetToken(token);
    if (!isValidToken) {
      throw new ValidationError('Invalid or expired password reset token');
    }

    const userId = await this.userAccountsRepository.getUserIdFromResetToken(token);
    const passwordHash = this.hashPassword(newPassword);

    await this.userAccountsRepository.markResetTokenAsUsed(token);
    return this.userAccountsRepository.updatePassword(userId, passwordHash);
  }

  async createPasswordResetToken(userId: string): Promise<PasswordResetToken> {
    // Verify user exists
    await this.getUserAccount(userId);
    return this.userAccountsRepository.createPasswordResetToken(userId);
  }

  async blockAccount(userId: string): Promise<UserAccount> {
    return this.userAccountsRepository.blockAccount(userId);
  }

  async unblockAccount(userId: string): Promise<UserAccount> {
    return this.userAccountsRepository.unblockAccount(userId);
  }

  async isAccountBlocked(userId: string): Promise<boolean> {
    return this.userAccountsRepository.isAccountBlocked(userId);
  }

  // KYC Document Methods
  async uploadKYCDocument(
    userId: string,
    tipoDocumento: 'dni' | 'selfie' | 'comprobante_domicilio',
    urlDocumento: string
  ): Promise<KYCDocument> {
    // Verify user exists
    await this.getUserAccount(userId);

    // Validate URL format
    if (!urlDocumento || typeof urlDocumento !== 'string') {
      throw new ValidationError('Invalid document URL');
    }

    const documento: KYCDocument = {
      id_documento: crypto.randomUUID(),
      usuario_id: userId,
      tipo_documento: tipoDocumento,
      url_documento: urlDocumento,
      fecha_carga: new Date(),
      estado_validacion: KYCStatus.PENDIENTE,
    };

    return this.userAccountsRepository.storeKYCDocument(documento);
  }

  async getKYCDocuments(userId: string): Promise<KYCDocument[]> {
    // Verify user exists
    await this.getUserAccount(userId);
    return this.userAccountsRepository.getKYCDocuments(userId);
  }

  async approveKYC(userId: string): Promise<UserAccount> {
    // Verify user has uploaded required documents
    const documentos = await this.getKYCDocuments(userId);
    const hasDNI = documentos.some((d) => d.tipo_documento === 'dni');
    const hasSelfie = documentos.some((d) => d.tipo_documento === 'selfie');

    if (!hasDNI || !hasSelfie) {
      throw new ValidationError('User must upload DNI and selfie photos for KYC approval');
    }

    const account = await this.userAccountsRepository.updateKYCStatus(userId, KYCStatus.APROBADO);

    // Update transfer limits for KYC-approved users
    await this.userAccountsRepository.updateTransferLimit(userId, 50000);

    return account;
  }

  async rejectKYC(userId: string, motivo: string): Promise<UserAccount> {
    if (!motivo || motivo.trim() === '') {
      throw new ValidationError('Rejection reason is required');
    }

    return this.userAccountsRepository.updateKYCStatus(userId, KYCStatus.RECHAZADO, motivo);
  }

  async getKYCStatus(userId: string): Promise<KYCStatus | null> {
    // Verify user exists
    await this.getUserAccount(userId);
    return this.userAccountsRepository.getKYCStatus(userId);
  }

  async updateTransferLimit(userId: string, limite: number): Promise<UserAccount> {
    if (limite <= 0) {
      throw new ValidationError('Transfer limit must be greater than 0');
    }

    return this.userAccountsRepository.updateTransferLimit(userId, limite);
  }

  async getTransferLimit(userId: string): Promise<number> {
    return this.userAccountsRepository.getTransferLimit(userId);
  }
}

export default new UserAccountsService();
