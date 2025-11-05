import { Request, Response, NextFunction } from 'express';
import UserAccountsService from '@/services/UserAccountsService.js';
import CreditsService from '@/services/CreditsService.js';
import BankingAPI from '@/services/BankingAPI.js';
import TransfersService from '@/services/TransfersService.js';
import { ValidationError } from '@/errors/AppError.js';

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

  /**
   * GET /api/transfers/limits/:usuario_id
   * Get transfer limits for a user
   */
  async getTransferLimits(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { usuario_id } = req.params;

      if (!usuario_id) {
        throw new ValidationError('Missing required field: usuario_id');
      }

      const account = await this.userAccountsService.getUserAccount(usuario_id);

      // Calculate transfer limits based on KYC status
      const limite_actual = account.kyc_completo ? 50000 : 10000;

      // Get today's transfer total
      const usedToday = await this.transfersService.getDailyTransferTotal(usuario_id);
      const disponible = Math.max(0, limite_actual - usedToday);

      res.json({
        exito: true,
        usuario_id,
        limite_actual,
        usado_hoy: usedToday,
        disponible,
        kyc_completo: account.kyc_completo,
        como_ampliar: account.kyc_completo ? null : 'kyc',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/transfers/check-limits
   * Check transfer limits before execution (preview)
   */
  async checkLimitsPreview(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { usuario_id, monto_transferencia } = req.body;

      if (!usuario_id || !monto_transferencia) {
        throw new ValidationError('Missing required fields: usuario_id, monto_transferencia');
      }

      if (monto_transferencia <= 0) {
        throw new ValidationError('Transfer amount must be greater than 0');
      }

      const account = await this.userAccountsService.getUserAccount(usuario_id);
      const limite_actual = account.kyc_completo ? 50000 : 10000;
      const usedToday = await this.transfersService.getDailyTransferTotal(usuario_id);
      const disponible = Math.max(0, limite_actual - usedToday);

      // Check if transfer amount exceeds limit
      if (monto_transferencia > disponible) {
        res.json({
          exito: false,
          puede_transferir: false,
          code: 'LIMITE_EXCEDIDO',
          error: `Excediste tu límite diario de $${limite_actual}. Completá tu KYC para ampliarlo.`,
          data: {
            limite_actual,
            usado_hoy: usedToday,
            disponible,
            monto_solicitado: monto_transferencia,
            exceso: monto_transferencia - disponible,
            como_ampliar: account.kyc_completo ? null : 'kyc',
          },
        });
      } else {
        res.json({
          exito: true,
          puede_transferir: true,
          data: {
            limite_actual,
            usado_hoy: usedToday,
            disponible,
            monto_solicitado: monto_transferencia,
            kyc_completo: account.kyc_completo,
          },
        });
      }
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/transfers/fraud-check
   * Perform fraud check on transfer
   */
  async performFraudCheck(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { usuario_id, monto_transferencia, cuenta_destino } = req.body;

      if (!usuario_id || !monto_transferencia || !cuenta_destino) {
        throw new ValidationError('Missing required fields: usuario_id, monto_transferencia, cuenta_destino');
      }

      if (monto_transferencia <= 0) {
        throw new ValidationError('Transfer amount must be greater than 0');
      }

      // Perform basic fraud checks
      const fraudRisks = [];

      // Check 1: Unusual transfer amount
      const account = await this.userAccountsService.getUserAccount(usuario_id);
      const accountAge = Math.floor(
        (Date.now() - new Date(account.fecha_registro).getTime()) / (1000 * 60 * 60 * 24)
      );

      if (accountAge < 30 && monto_transferencia > 5000) {
        fraudRisks.push({
          tipo: 'cuenta_nueva_monto_alto',
          severity: 'media',
          descripcion: 'Cuenta nueva con transferencia de monto alto',
        });
      }

      // Check 2: High frequency transfers (mock check)
      const dailyTransfers = await this.transfersService.getDailyTransferCount(usuario_id);
      if (dailyTransfers > 10) {
        fraudRisks.push({
          tipo: 'transferencias_frecuentes',
          severity: 'alta',
          descripcion: 'Múltiples transferencias en poco tiempo',
        });
      }

      // Check 3: Account status
      if (account.historial_mora) {
        fraudRisks.push({
          tipo: 'historial_mora',
          severity: 'alta',
          descripcion: 'Cuenta con historial de mora',
        });
      }

      const riesgo_fraude = fraudRisks.length > 0 ? 'alto' : 'bajo';
      const requiere_verificacion = fraudRisks.some(r => r.severity === 'alta');

      res.json({
        exito: true,
        usuario_id,
        monto_transferencia,
        cuenta_destino: cuenta_destino.substring(0, 4) + '****' + cuenta_destino.substring(cuenta_destino.length - 2),
        riesgo_fraude,
        requiere_verificacion_adicional: requiere_verificacion,
        factores_riesgo: fraudRisks,
        puede_proceder: !requiere_verificacion,
      });
    } catch (error) {
      next(error);
    }
  }
}

export default new TransferHandler();
