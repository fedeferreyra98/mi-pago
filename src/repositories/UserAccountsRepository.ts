import { supabaseAdmin } from '@/config/supabase.js';
import { UserAccount, KYCDocument, PasswordResetToken, KYCStatus } from '@/types/index.js';
import { DatabaseError, NotFoundError } from '@/errors/AppError.js';
import crypto from 'crypto';

export class UserAccountsRepository {
  private tableName = 'user_accounts';

  async findByUserId(userId: string): Promise<UserAccount | null> {
    try {
      const { data, error } = await supabaseAdmin
        .from(this.tableName)
        .select('*')
        .eq('usuario_id', userId)
        .single();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      return data || null;
    } catch (error) {
      throw new DatabaseError(`Failed to find user account: ${error}`);
    }
  }

  async create(account: Omit<UserAccount, 'fecha_actualizacion'>): Promise<UserAccount> {
    try {
      const { data, error } = await supabaseAdmin
        .from(this.tableName)
        .insert([
          {
            usuario_id: account.usuario_id,
            kyc_completo: account.kyc_completo,
            fecha_registro: account.fecha_registro,
            saldo_disponible: account.saldo_disponible,
            ingresos_declarados: account.ingresos_declarados,
            historial_mora: account.historial_mora,
            score_externo: account.score_externo,
            fecha_actualizacion: new Date(),
          },
        ])
        .select()
        .single();

      if (error) throw error;

      return data;
    } catch (error) {
      throw new DatabaseError(`Failed to create user account: ${error}`);
    }
  }

  async update(userId: string, updates: Partial<UserAccount>): Promise<UserAccount> {
    try {
      const { data, error } = await supabaseAdmin
        .from(this.tableName)
        .update({
          ...updates,
          fecha_actualizacion: new Date(),
        })
        .eq('usuario_id', userId)
        .select()
        .single();

      if (error) throw error;
      if (!data) throw new NotFoundError(`User account ${userId} not found`);

      return data;
    } catch (error) {
      if (error instanceof NotFoundError) throw error;
      throw new DatabaseError(`Failed to update user account: ${error}`);
    }
  }

  async updateBalance(userId: string, newBalance: number): Promise<UserAccount> {
    return this.update(userId, { saldo_disponible: newBalance });
  }

  async getBalance(userId: string): Promise<number> {
    try {
      const account = await this.findByUserId(userId);
      if (!account) throw new NotFoundError(`User account ${userId} not found`);
      return account.saldo_disponible;
    } catch (error) {
      if (error instanceof NotFoundError) throw error;
      throw new DatabaseError(`Failed to get balance: ${error}`);
    }
  }

  async checkKYCStatus(userId: string): Promise<boolean> {
    try {
      const account = await this.findByUserId(userId);
      if (!account) throw new NotFoundError(`User account ${userId} not found`);
      return account.kyc_completo;
    } catch (error) {
      if (error instanceof NotFoundError) throw error;
      throw new DatabaseError(`Failed to check KYC status: ${error}`);
    }
  }

  async getAccountAge(userId: string): Promise<number> {
    try {
      const account = await this.findByUserId(userId);
      if (!account) throw new NotFoundError(`User account ${userId} not found`);

      const ageInMs = Date.now() - new Date(account.fecha_registro).getTime();
      return Math.floor(ageInMs / (1000 * 60 * 60 * 24));
    } catch (error) {
      if (error instanceof NotFoundError) throw error;
      throw new DatabaseError(`Failed to get account age: ${error}`);
    }
  }

  async getDeclaredIncome(userId: string): Promise<number | null> {
    try {
      const account = await this.findByUserId(userId);
      if (!account) throw new NotFoundError(`User account ${userId} not found`);
      return account.ingresos_declarados;
    } catch (error) {
      if (error instanceof NotFoundError) throw error;
      throw new DatabaseError(`Failed to get declared income: ${error}`);
    }
  }

  async hasDefaultHistory(userId: string): Promise<boolean> {
    try {
      const account = await this.findByUserId(userId);
      if (!account) throw new NotFoundError(`User account ${userId} not found`);
      return account.historial_mora;
    } catch (error) {
      if (error instanceof NotFoundError) throw error;
      throw new DatabaseError(`Failed to check default history: ${error}`);
    }
  }

  async getExternalScore(userId: string): Promise<number | null> {
    try {
      const account = await this.findByUserId(userId);
      if (!account) throw new NotFoundError(`User account ${userId} not found`);
      return account.score_externo;
    } catch (error) {
      if (error instanceof NotFoundError) throw error;
      throw new DatabaseError(`Failed to get external score: ${error}`);
    }
  }

  // Password and Account Security Methods
  async updatePassword(userId: string, passwordHash: string): Promise<UserAccount> {
    try {
      return this.update(userId, { password_hash: passwordHash });
    } catch (error) {
      if (error instanceof NotFoundError) throw error;
      throw new DatabaseError(`Failed to update password: ${error}`);
    }
  }

  async getPasswordHash(userId: string): Promise<string | null> {
    try {
      const account = await this.findByUserId(userId);
      if (!account) throw new NotFoundError(`User account ${userId} not found`);
      return account.password_hash || null;
    } catch (error) {
      if (error instanceof NotFoundError) throw error;
      throw new DatabaseError(`Failed to get password hash: ${error}`);
    }
  }

  async recordFailedLoginAttempt(userId: string): Promise<UserAccount> {
    try {
      const account = await this.findByUserId(userId);
      if (!account) throw new NotFoundError(`User account ${userId} not found`);

      const newAttempts = (account.intentos_fallidos || 0) + 1;
      const shouldBlock = newAttempts >= 5;

      const updates: Partial<UserAccount> = {
        intentos_fallidos: newAttempts,
      };

      if (shouldBlock) {
        updates.bloqueado = true;
        // Set unlock time to 1 hour from now
        updates.fecha_proximo_intento = new Date(Date.now() + 60 * 60 * 1000);
      }

      return this.update(userId, updates);
    } catch (error) {
      if (error instanceof NotFoundError) throw error;
      throw new DatabaseError(`Failed to record login attempt: ${error}`);
    }
  }

  async resetFailedLoginAttempts(userId: string): Promise<UserAccount> {
    try {
      return this.update(userId, {
        intentos_fallidos: 0,
        fecha_proximo_intento: undefined,
      });
    } catch (error) {
      if (error instanceof NotFoundError) throw error;
      throw new DatabaseError(`Failed to reset login attempts: ${error}`);
    }
  }

  async blockAccount(userId: string, razon?: string): Promise<UserAccount> {
    try {
      return this.update(userId, {
        bloqueado: true,
      });
    } catch (error) {
      if (error instanceof NotFoundError) throw error;
      throw new DatabaseError(`Failed to block account: ${error}`);
    }
  }

  async unblockAccount(userId: string): Promise<UserAccount> {
    try {
      return this.update(userId, {
        bloqueado: false,
        intentos_fallidos: 0,
        fecha_proximo_intento: undefined,
      });
    } catch (error) {
      if (error instanceof NotFoundError) throw error;
      throw new DatabaseError(`Failed to unblock account: ${error}`);
    }
  }

  async isAccountBlocked(userId: string): Promise<boolean> {
    try {
      const account = await this.findByUserId(userId);
      if (!account) throw new NotFoundError(`User account ${userId} not found`);

      if (!account.bloqueado) return false;

      // Check if temporary block has expired
      if (account.fecha_proximo_intento && new Date(account.fecha_proximo_intento) <= new Date()) {
        // Unlock automatically
        await this.unblockAccount(userId);
        return false;
      }

      return account.bloqueado;
    } catch (error) {
      if (error instanceof NotFoundError) throw error;
      throw new DatabaseError(`Failed to check account block status: ${error}`);
    }
  }

  // KYC Document Methods
  async storeKYCDocument(documento: KYCDocument): Promise<KYCDocument> {
    try {
      const { data, error } = await supabaseAdmin
        .from('kyc_documents')
        .insert([
          {
            id_documento: documento.id_documento,
            usuario_id: documento.usuario_id,
            tipo_documento: documento.tipo_documento,
            url_documento: documento.url_documento,
            fecha_carga: documento.fecha_carga,
            estado_validacion: documento.estado_validacion,
            motivo_rechazo: documento.motivo_rechazo,
          },
        ])
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      throw new DatabaseError(`Failed to store KYC document: ${error}`);
    }
  }

  async getKYCDocuments(userId: string): Promise<KYCDocument[]> {
    try {
      const { data, error } = await supabaseAdmin
        .from('kyc_documents')
        .select('*')
        .eq('usuario_id', userId)
        .order('fecha_carga', { ascending: false });

      if (error) throw error;
      return data || [];
    } catch (error) {
      throw new DatabaseError(`Failed to retrieve KYC documents: ${error}`);
    }
  }

  async updateKYCStatus(userId: string, status: KYCStatus, razonRechazo?: string): Promise<UserAccount> {
    try {
      const updates: Partial<UserAccount> = {
        kyc_status: status,
      };

      if (status === KYCStatus.APROBADO) {
        updates.kyc_completo = true;
        updates.limite_transferencia = 50000; // Set default limit for KYC-approved users
      } else if (status === KYCStatus.RECHAZADO) {
        updates.kyc_completo = false;
      }

      return this.update(userId, updates);
    } catch (error) {
      if (error instanceof NotFoundError) throw error;
      throw new DatabaseError(`Failed to update KYC status: ${error}`);
    }
  }

  async getKYCStatus(userId: string): Promise<KYCStatus | null> {
    try {
      const account = await this.findByUserId(userId);
      if (!account) throw new NotFoundError(`User account ${userId} not found`);
      return account.kyc_status || null;
    } catch (error) {
      if (error instanceof NotFoundError) throw error;
      throw new DatabaseError(`Failed to get KYC status: ${error}`);
    }
  }

  // Password Reset Token Methods
  async createPasswordResetToken(userId: string): Promise<PasswordResetToken> {
    try {
      const token = crypto.randomBytes(32).toString('hex');
      const ahora = new Date();
      const vencimiento = new Date(ahora.getTime() + 24 * 60 * 60 * 1000); // 24 hours

      const { data, error } = await supabaseAdmin
        .from('password_reset_tokens')
        .insert([
          {
            token,
            usuario_id: userId,
            fecha_creacion: ahora,
            fecha_vencimiento: vencimiento,
            utilizado: false,
          },
        ])
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      throw new DatabaseError(`Failed to create password reset token: ${error}`);
    }
  }

  async validatePasswordResetToken(token: string): Promise<boolean> {
    try {
      const { data, error } = await supabaseAdmin
        .from('password_reset_tokens')
        .select('*')
        .eq('token', token)
        .eq('utilizado', false)
        .single();

      if (error || !data) return false;

      // Check if token has expired
      const ahora = new Date();
      const vencimiento = new Date(data.fecha_vencimiento);
      return vencimiento > ahora;
    } catch (error) {
      throw new DatabaseError(`Failed to validate password reset token: ${error}`);
    }
  }

  async markResetTokenAsUsed(token: string): Promise<void> {
    try {
      const { error } = await supabaseAdmin
        .from('password_reset_tokens')
        .update({
          utilizado: true,
          fecha_utilizacion: new Date(),
        })
        .eq('token', token);

      if (error) throw error;
    } catch (error) {
      throw new DatabaseError(`Failed to mark reset token as used: ${error}`);
    }
  }

  async getUserIdFromResetToken(token: string): Promise<string> {
    try {
      const { data, error } = await supabaseAdmin
        .from('password_reset_tokens')
        .select('usuario_id')
        .eq('token', token)
        .eq('utilizado', false)
        .single();

      if (error || !data) throw new NotFoundError('Invalid or expired reset token');
      return data.usuario_id;
    } catch (error) {
      if (error instanceof NotFoundError) throw error;
      throw new DatabaseError(`Failed to get user from reset token: ${error}`);
    }
  }

  async updateTransferLimit(userId: string, limite: number): Promise<UserAccount> {
    try {
      if (limite <= 0) {
        throw new Error('Transfer limit must be greater than 0');
      }
      return this.update(userId, { limite_transferencia: limite });
    } catch (error) {
      if (error instanceof NotFoundError) throw error;
      throw new DatabaseError(`Failed to update transfer limit: ${error}`);
    }
  }

  async getTransferLimit(userId: string): Promise<number> {
    try {
      const account = await this.findByUserId(userId);
      if (!account) throw new NotFoundError(`User account ${userId} not found`);
      return account.limite_transferencia || 10000; // Default limit if not set
    } catch (error) {
      if (error instanceof NotFoundError) throw error;
      throw new DatabaseError(`Failed to get transfer limit: ${error}`);
    }
  }
}

export default new UserAccountsRepository();
