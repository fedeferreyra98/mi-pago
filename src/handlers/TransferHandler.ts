import { Request, Response, NextFunction } from 'express';
import UserAccountsService from '@/services/UserAccountsService.js';
import CreditsService from '@/services/CreditsService.js';
import BankingAPI from '@/services/BankingAPI.js';
import TransfersService from '@/services/TransfersService.js';
import { CreditType } from '@/types/index.js';
import { ValidationError, InsufficientFundsError } from '@/errors/AppError.js';

export class TransferHandler {
  private userAccountsService = UserAccountsService;
  private creditsService = CreditsService;
  private bankingAPI = BankingAPI;
  private transfersService = TransfersService;

  /**
   * Handle transfer request with automatic quick credit offer if balance insufficient
   */
  async handleTransfer(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { usuario_id, monto_destino, cuenta_destino } = req.body;

      if (!usuario_id || !monto_destino || !cuenta_destino) {
        throw new ValidationError('Missing required fields: usuario_id, monto_destino, cuenta_destino');
      }

      if (monto_destino <= 0) {
        throw new ValidationError('Transfer amount must be greater than 0');
      }

      // Get current balance
      const currentBalance = await this.userAccountsService.getBalance(usuario_id);

      // Check if balance is sufficient
      if (currentBalance >= monto_destino) {
        // Direct transfer
        const result = await this.bankingAPI.transferFunds(usuario_id, cuenta_destino, monto_destino);

        if (result.exito) {
          res.json({
            exito: true,
            tipo_resultado: 'transferencia_directa',
            transaccion_id: result.transaccion_id,
            monto: monto_destino,
            saldo_resultante: result.saldo_resultante,
            fecha: result.fecha,
          });
        } else {
          throw new Error(result.razon_fallo);
        }
      } else {
        // Insufficient balance - offer quick credit
        const faltante = monto_destino - currentBalance;

        const creditOffer = await this.creditsService.simulateQuickCredit(
          usuario_id,
          faltante,
          30 // Default 30 days
        );

        res.json({
          exito: false,
          tipo_resultado: 'saldo_insuficiente_oferta_credito',
          mensaje: `Saldo insuficiente. Se ofrece crédito rápido`,
          saldo_actual: currentBalance,
          monto_faltante: faltante,
          oferta_credito: creditOffer,
        });
      }
    } catch (error) {
      next(error);
    }
  }

  /**
   * Confirm transfer after quick credit acceptance
   */
  async confirmTransferWithCredit(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { usuario_id, id_credito, monto_destino, cuenta_destino } = req.body;

      if (!usuario_id || !id_credito || !monto_destino || !cuenta_destino) {
        throw new ValidationError(
          'Missing required fields: usuario_id, id_credito, monto_destino, cuenta_destino'
        );
      }

      // Approve and disburse credit
      const credit = await this.creditsService.approveCreditAndDisburse(id_credito);

      // Process transfer
      const transferResult = await this.bankingAPI.transferFunds(
        usuario_id,
        cuenta_destino,
        monto_destino
      );

      if (!transferResult.exito) {
        throw new Error(`Transfer failed: ${transferResult.razon_fallo}`);
      }

      res.json({
        exito: true,
        tipo_resultado: 'transferencia_con_credito',
        transaccion_id: transferResult.transaccion_id,
        credito: {
          id_credito: credit.id_credito,
          monto_desembolsado: credit.monto_solicitado,
          monto_total_a_pagar: credit.monto_total,
          cuotas: credit.cuotas,
          tasa_tea: credit.tasa_tea,
          tasa_cft: credit.tasa_cft,
        },
        transferencia: {
          monto: monto_destino,
          saldo_resultante: transferResult.saldo_resultante,
        },
        fecha: new Date(),
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get transfer options (analyze if credit would be needed)
   */
  async analyzeTransfer(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { usuario_id, monto_destino } = req.body;

      if (!usuario_id || !monto_destino) {
        throw new ValidationError('Missing required fields: usuario_id, monto_destino');
      }

      const currentBalance = await this.userAccountsService.getBalance(usuario_id);

      const analysis = {
        usuario_id,
        monto_solicitado: monto_destino,
        saldo_actual: currentBalance,
        puede_transferir_directo: currentBalance >= monto_destino,
        faltante: Math.max(0, monto_destino - currentBalance),
      };

      if (analysis.faltante > 0) {
        const quickCreditOffer = await this.creditsService.simulateQuickCredit(
          usuario_id,
          analysis.faltante,
          30
        );

        Object.assign(analysis, {
          opciones_credito: [
            {
              tipo: 'rapido_30',
              ...quickCreditOffer,
            },
            {
              tipo: 'rapido_60',
              ...(await this.creditsService.simulateQuickCredit(usuario_id, analysis.faltante, 60)),
            },
            {
              tipo: 'rapido_90',
              ...(await this.creditsService.simulateQuickCredit(usuario_id, analysis.faltante, 90)),
            },
          ],
        });
      }

      res.json(analysis);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/transfers/:id_transferencia
   * Get transfer detail with receipt information
   */
  async getTransferDetail(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id_transferencia } = req.params;
      const { usuario_id } = req.body;

      if (!id_transferencia || !usuario_id) {
        throw new ValidationError('Missing required fields: id_transferencia, usuario_id');
      }

      const transfer = await this.transfersService.getTransferDetail(id_transferencia, usuario_id);

      res.json({
        exito: true,
        transferencia: transfer,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/transfers/:id_transferencia/comprobante
   * Get receipt for a transfer
   */
  async getComprobanteDetail(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id_transferencia } = req.params;
      const { usuario_id } = req.body;

      if (!id_transferencia || !usuario_id) {
        throw new ValidationError('Missing required fields: id_transferencia, usuario_id');
      }

      const comprobanteDetail = await this.transfersService.getComprobanteDetail(
        id_transferencia,
        usuario_id
      );

      res.json({
        exito: true,
        comprobante: comprobanteDetail,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/transfers/:id_transferencia/comprobante/download
   * Generate PDF download link for receipt
   */
  async generatePdfDownload(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id_transferencia } = req.params;
      const { usuario_id } = req.body;

      if (!id_transferencia || !usuario_id) {
        throw new ValidationError('Missing required fields: id_transferencia, usuario_id');
      }

      const downloadUrl = await this.transfersService.getDownloadLink(id_transferencia, usuario_id);

      res.json({
        exito: true,
        descarga_url: downloadUrl,
        fecha_expiracion: new Date(Date.now() + 24 * 60 * 60 * 1000),
        mensaje: 'Link available for 24 hours',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/transfers/:id_transferencia/comprobante/share
   * Get shareable link for receipt
   */
  async getShareableLink(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id_transferencia } = req.params;
      const { usuario_id } = req.body;

      if (!id_transferencia || !usuario_id) {
        throw new ValidationError('Missing required fields: id_transferencia, usuario_id');
      }

      const shareUrl = await this.transfersService.shareComprobante(id_transferencia, usuario_id);

      res.json({
        exito: true,
        compartir_url: shareUrl,
        valido_por_dias: 7,
        mensaje: 'Share this link with others',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/transfers/user/:usuario_id/receipts
   * List user's transfer receipts
   */
  async getUserReceipts(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { usuario_id } = req.params;
      const { limit = '20', offset = '0' } = req.query;

      if (!usuario_id) {
        throw new ValidationError('Missing required field: usuario_id');
      }

      const limitNum = Math.min(parseInt(limit as string) || 20, 100);
      const offsetNum = parseInt(offset as string) || 0;

      const comprobantes = await this.transfersService.getUserComprobantesList(
        usuario_id,
        limitNum,
        offsetNum
      );

      res.json({
        exito: true,
        comprobantes,
        total: comprobantes.length,
        limite: limitNum,
        offset: offsetNum,
      });
    } catch (error) {
      next(error);
    }
  }
}

export default new TransferHandler();
