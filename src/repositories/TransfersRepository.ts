import { supabaseAdmin } from '@/config/supabase.js';
import { Transfer, Comprobante, TransferStatus } from '@/types/index.js';
import { DatabaseError, NotFoundError } from '@/errors/AppError.js';
import { v4 as uuidv4 } from 'uuid';

export class TransfersRepository {
  private transferTableName = 'transferencias';
  private comprobanteTableName = 'comprobantes';

  /**
   * Create a new transfer record
   */
  async createTransfer(
    data: Omit<Transfer, 'id_transferencia' | 'fecha_creacion' | 'fecha_actualizacion'>
  ): Promise<Transfer> {
    try {
      const transferData = {
        id_transferencia: uuidv4(),
        ...data,
        fecha_creacion: new Date(),
        fecha_actualizacion: new Date(),
      };

      const { data: result, error } = await supabaseAdmin
        .from(this.transferTableName)
        .insert([transferData])
        .select()
        .single();

      if (error) throw error;
      return result;
    } catch (error) {
      throw new DatabaseError(`Failed to create transfer: ${error}`);
    }
  }

  /**
   * Retrieve a transfer by ID
   */
  async getTransferById(transferId: string): Promise<Transfer | null> {
    try {
      const { data, error } = await supabaseAdmin
        .from(this.transferTableName)
        .select('*')
        .eq('id_transferencia', transferId)
        .single();

      if (error && error.code !== 'PGRST116') throw error;
      return data || null;
    } catch (error) {
      throw new DatabaseError(`Failed to get transfer: ${error}`);
    }
  }

  /**
   * List transfers for a user with pagination
   */
  async getTransfersForUser(
    userId: string,
    limit: number = 20,
    offset: number = 0
  ): Promise<Transfer[]> {
    try {
      const { data, error } = await supabaseAdmin
        .from(this.transferTableName)
        .select('*')
        .or(`usuario_id_origen.eq.${userId},usuario_id_destino.eq.${userId}`)
        .order('fecha_creacion', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) throw error;
      return data || [];
    } catch (error) {
      throw new DatabaseError(`Failed to get transfers for user: ${error}`);
    }
  }

  /**
   * Update transfer status
   */
  async updateTransferStatus(transferId: string, status: TransferStatus): Promise<Transfer> {
    try {
      const { data, error } = await supabaseAdmin
        .from(this.transferTableName)
        .update({
          estado: status,
          fecha_actualizacion: new Date(),
        })
        .eq('id_transferencia', transferId)
        .select()
        .single();

      if (error) throw error;
      if (!data) throw new NotFoundError('Transfer not found');
      return data;
    } catch (error) {
      throw new DatabaseError(`Failed to update transfer status: ${error}`);
    }
  }

  /**
   * Create a receipt (comprobante) record
   */
  async createComprobante(
    transferId: string,
    comprobanteData: Omit<Comprobante, 'id_comprobante' | 'fecha_creacion'>
  ): Promise<Comprobante> {
    try {
      const data = {
        id_comprobante: uuidv4(),
        ...comprobanteData,
        fecha_creacion: new Date(),
      };

      const { data: result, error } = await supabaseAdmin
        .from(this.comprobanteTableName)
        .insert([data])
        .select()
        .single();

      if (error) throw error;
      return result;
    } catch (error) {
      throw new DatabaseError(`Failed to create comprobante: ${error}`);
    }
  }

  /**
   * Get receipt by transfer ID
   */
  async getComprobanteByTransferId(transferId: string): Promise<Comprobante | null> {
    try {
      const { data, error } = await supabaseAdmin
        .from(this.comprobanteTableName)
        .select('*')
        .eq('id_transferencia', transferId)
        .single();

      if (error && error.code !== 'PGRST116') throw error;
      return data || null;
    } catch (error) {
      throw new DatabaseError(`Failed to get comprobante: ${error}`);
    }
  }

  /**
   * Get receipt by ID
   */
  async getComprobanteById(comprobanteId: string): Promise<Comprobante | null> {
    try {
      const { data, error } = await supabaseAdmin
        .from(this.comprobanteTableName)
        .select('*')
        .eq('id_comprobante', comprobanteId)
        .single();

      if (error && error.code !== 'PGRST116') throw error;
      return data || null;
    } catch (error) {
      throw new DatabaseError(`Failed to get comprobante by ID: ${error}`);
    }
  }

  /**
   * Update receipt PDF URL
   */
  async updateComprobanteUrl(
    comprobanteId: string,
    pdfUrl: string,
    estado: 'generado' | 'disponible' | 'expirado' = 'disponible'
  ): Promise<Comprobante> {
    try {
      const { data, error } = await supabaseAdmin
        .from(this.comprobanteTableName)
        .update({
          pdf_url: pdfUrl,
          estado_descarga: estado,
          fecha_expiracion: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours expiry
        })
        .eq('id_comprobante', comprobanteId)
        .select()
        .single();

      if (error) throw error;
      if (!data) throw new NotFoundError('Comprobante not found');
      return data;
    } catch (error) {
      throw new DatabaseError(`Failed to update comprobante URL: ${error}`);
    }
  }

  /**
   * Get receipts for a user
   */
  async getComprobantesByUserId(userId: string, limit: number = 20, offset: number = 0): Promise<Comprobante[]> {
    try {
      const { data, error } = await supabaseAdmin
        .from(this.comprobanteTableName)
        .select(
          `
          *,
          transferencias(usuario_id_origen, usuario_id_destino)
        `
        )
        .order('fecha_creacion', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) throw error;

      // Filter for the user's comprobantes (where they are origin or destination)
      return (data || []).filter((comprobante: any) => {
        const transfer = comprobante.transferencias;
        return transfer.usuario_id_origen === userId || transfer.usuario_id_destino === userId;
      });
    } catch (error) {
      throw new DatabaseError(`Failed to get comprobantes for user: ${error}`);
    }
  }

  /**
   * Get transfers for a user on a specific date
   */
  async getTransfersByUserIdAndDate(userId: string, date: Date): Promise<Transfer[]> {
    try {
      // Get start of day in UTC
      const startOfDay = new Date(date);
      startOfDay.setUTCHours(0, 0, 0, 0);

      // Get end of day in UTC
      const endOfDay = new Date(date);
      endOfDay.setUTCHours(23, 59, 59, 999);

      const { data, error } = await supabaseAdmin
        .from(this.transferTableName)
        .select('*')
        .eq('usuario_id_origen', userId)
        .gte('fecha_creacion', startOfDay.toISOString())
        .lte('fecha_creacion', endOfDay.toISOString());

      if (error) throw error;
      return data || [];
    } catch (error) {
      throw new DatabaseError(`Failed to get transfers for user and date: ${error}`);
    }
  }
}

export default new TransfersRepository();
