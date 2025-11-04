import { supabaseAdmin } from '@/config/supabase.js';
import { UserAccount } from '@/types/index.js';
import { DatabaseError, NotFoundError } from '@/errors/AppError.js';

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
}

export default new UserAccountsRepository();
