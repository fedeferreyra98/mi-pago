import { supabaseAdmin } from '@/config/supabase.js';
import { Credit, Installment, CreditStatus, InstallmentStatus } from '@/types/index.js';
import { DatabaseError, NotFoundError } from '@/errors/AppError.js';
import { v4 as uuidv4 } from 'uuid';

export class CreditsRepository {
  private creditTableName = 'creditos';
  private installmentTableName = 'cuotas';

  async createCredit(credit: Omit<Credit, 'id_credito' | 'fecha_creacion' | 'fecha_actualizacion'>): Promise<Credit> {
    try {
      const creditData = {
        id_credito: uuidv4(),
        ...credit,
        fecha_creacion: new Date(),
        fecha_actualizacion: new Date(),
      };

      const { data, error } = await supabaseAdmin
        .from(this.creditTableName)
        .insert([creditData])
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      throw new DatabaseError(`Failed to create credit: ${error}`);
    }
  }

  async findCreditById(creditId: string): Promise<Credit | null> {
    try {
      const { data, error } = await supabaseAdmin
        .from(this.creditTableName)
        .select('*')
        .eq('id_credito', creditId)
        .single();

      if (error && error.code !== 'PGRST116') throw error;

      return data || null;
    } catch (error) {
      throw new DatabaseError(`Failed to find credit: ${error}`);
    }
  }

  async findCreditsByUserId(userId: string): Promise<Credit[]> {
    try {
      const { data, error } = await supabaseAdmin
        .from(this.creditTableName)
        .select('*')
        .eq('usuario_id', userId)
        .order('fecha_creacion', { ascending: false });

      if (error) throw error;

      return data || [];
    } catch (error) {
      throw new DatabaseError(`Failed to find credits for user: ${error}`);
    }
  }

  async updateCreditStatus(creditId: string, status: CreditStatus): Promise<Credit> {
    try {
      const { data, error } = await supabaseAdmin
        .from(this.creditTableName)
        .update({
          estado: status,
          fecha_actualizacion: new Date(),
        })
        .eq('id_credito', creditId)
        .select()
        .single();

      if (error) throw error;
      if (!data) throw new NotFoundError(`Credit ${creditId} not found`);

      return data;
    } catch (error) {
      if (error instanceof NotFoundError) throw error;
      throw new DatabaseError(`Failed to update credit status: ${error}`);
    }
  }

  async updateCredit(creditId: string, updates: Partial<Credit>): Promise<Credit> {
    try {
      const { data, error } = await supabaseAdmin
        .from(this.creditTableName)
        .update({
          ...updates,
          fecha_actualizacion: new Date(),
        })
        .eq('id_credito', creditId)
        .select()
        .single();

      if (error) throw error;
      if (!data) throw new NotFoundError(`Credit ${creditId} not found`);

      return data;
    } catch (error) {
      if (error instanceof NotFoundError) throw error;
      throw new DatabaseError(`Failed to update credit: ${error}`);
    }
  }

  async markCreditDisbursed(creditId: string): Promise<Credit> {
    return this.updateCreditStatus(creditId, CreditStatus.DISBURSED);
  }

  async markCreditInProgress(creditId: string): Promise<Credit> {
    return this.updateCreditStatus(creditId, CreditStatus.IN_PROGRESS);
  }

  async getActiveCreditsByUser(userId: string): Promise<Credit[]> {
    try {
      const { data, error } = await supabaseAdmin
        .from(this.creditTableName)
        .select('*')
        .eq('usuario_id', userId)
        .in('estado', [CreditStatus.IN_PROGRESS, CreditStatus.DEFAULT])
        .order('fecha_creacion', { ascending: false });

      if (error) throw error;

      return data || [];
    } catch (error) {
      throw new DatabaseError(`Failed to get active credits: ${error}`);
    }
  }

  // Installment operations
  async createInstallment(installment: Omit<Installment, 'id_cuota'>): Promise<Installment> {
    try {
      const installmentData = {
        id_cuota: uuidv4(),
        ...installment,
      };

      const { data, error } = await supabaseAdmin
        .from(this.installmentTableName)
        .insert([installmentData])
        .select()
        .single();

      if (error) throw error;

      return data;
    } catch (error) {
      throw new DatabaseError(`Failed to create installment: ${error}`);
    }
  }

  async createInstallmentPlan(creditId: string, installments: Omit<Installment, 'id_cuota'>[]): Promise<Installment[]> {
    try {
      const installmentData = installments.map((inst) => ({
        id_cuota: uuidv4(),
        ...inst,
      }));

      const { data, error } = await supabaseAdmin
        .from(this.installmentTableName)
        .insert(installmentData)
        .select();

      if (error) throw error;

      return data || [];
    } catch (error) {
      throw new DatabaseError(`Failed to create installment plan: ${error}`);
    }
  }

  async getInstallmentsByCredit(creditId: string): Promise<Installment[]> {
    try {
      const { data, error } = await supabaseAdmin
        .from(this.installmentTableName)
        .select('*')
        .eq('id_credito', creditId)
        .order('nro_cuota', { ascending: true });

      if (error) throw error;

      return data || [];
    } catch (error) {
      throw new DatabaseError(`Failed to get installments: ${error}`);
    }
  }

  async updateInstallmentStatus(installmentId: string, status: InstallmentStatus): Promise<Installment> {
    try {
      const { data, error } = await supabaseAdmin
        .from(this.installmentTableName)
        .update({
          estado: status,
        })
        .eq('id_cuota', installmentId)
        .select()
        .single();

      if (error) throw error;
      if (!data) throw new NotFoundError(`Installment ${installmentId} not found`);

      return data;
    } catch (error) {
      if (error instanceof NotFoundError) throw error;
      throw new DatabaseError(`Failed to update installment: ${error}`);
    }
  }

  async markInstallmentPaid(installmentId: string): Promise<Installment> {
    return this.updateInstallmentStatus(installmentId, InstallmentStatus.PAID);
  }

  async getPendingInstallments(): Promise<Installment[]> {
    try {
      const { data, error } = await supabaseAdmin
        .from(this.installmentTableName)
        .select('*')
        .eq('estado', InstallmentStatus.PENDING)
        .lte('fecha_vencimiento', new Date());

      if (error) throw error;

      return data || [];
    } catch (error) {
      throw new DatabaseError(`Failed to get pending installments: ${error}`);
    }
  }

  async getOverdueInstallments(): Promise<Installment[]> {
    try {
      const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);

      const { data, error } = await supabaseAdmin
        .from(this.installmentTableName)
        .select('*')
        .in('estado', [InstallmentStatus.UNPAID, InstallmentStatus.RETRYING])
        .lt('fecha_vencimiento', threeDaysAgo);

      if (error) throw error;

      return data || [];
    } catch (error) {
      throw new DatabaseError(`Failed to get overdue installments: ${error}`);
    }
  }
}

export default new CreditsRepository();
