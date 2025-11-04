import { Request, Response, NextFunction } from 'express';
import CreditsService from '@/services/CreditsService.js';
import CreditsValidator from '@/services/CreditsValidator.js';
import UserAccountsService from '@/services/UserAccountsService.js';
import CreditsRepository from '@/repositories/CreditsRepository.js';
import { CreditType } from '@/types/index.js';
import { ValidationError, NotFoundError } from '@/errors/AppError.js';

export class CreditsHandler {
  private creditsService = CreditsService;
  private creditsValidator = CreditsValidator;
  private userAccountsService = UserAccountsService;
  private creditsRepository = CreditsRepository;

  /**
   * Check eligibility for quick credit
   */
  async checkQuickCreditEligibility(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { usuario_id } = req.body;

      if (!usuario_id) {
        throw new ValidationError('Missing required field: usuario_id');
      }

      const eligibility = await this.creditsValidator.validateQuickCreditEligibility(usuario_id);

      res.json({
        usuario_id,
        tipo_credito: 'rapido',
        elegible: eligibility.es_elegible,
        razon_rechazo: eligibility.razon_rechazo,
        limites: eligibility.limites_maximos,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Check eligibility for normal credit
   */
  async checkNormalCreditEligibility(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { usuario_id } = req.body;

      if (!usuario_id) {
        throw new ValidationError('Missing required field: usuario_id');
      }

      const eligibility = await this.creditsValidator.validateNormalCreditEligibility(usuario_id);

      res.json({
        usuario_id,
        tipo_credito: 'normal',
        elegible: eligibility.es_elegible,
        razon_rechazo: eligibility.razon_rechazo,
        limites: eligibility.limites_maximos,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Simulate quick credit with different terms
   */
  async simulateQuickCredit(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { usuario_id, monto, plazo_dias } = req.body;

      if (!usuario_id || !monto || !plazo_dias) {
        throw new ValidationError('Missing required fields: usuario_id, monto, plazo_dias');
      }

      // Validate amount
      const amountValidation = await this.creditsValidator.validateAmount(
        usuario_id,
        monto,
        CreditType.QUICK
      );
      if (!amountValidation.es_elegible) {
        throw new ValidationError(amountValidation.razon_rechazo!);
      }

      // Validate term
      const termValidation = await this.creditsValidator.validateTerm(plazo_dias, CreditType.QUICK);
      if (!termValidation.es_elegible) {
        throw new ValidationError(termValidation.razon_rechazo!);
      }

      const simulation = await this.creditsService.simulateQuickCredit(
        usuario_id,
        monto,
        plazo_dias
      );

      res.json({
        usuario_id,
        tipo_credito: 'rapido',
        simulacion: simulation,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Simulate normal credit with different terms
   */
  async simulateNormalCredit(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { usuario_id, monto, plazo_meses } = req.body;

      if (!usuario_id || !monto || !plazo_meses) {
        throw new ValidationError('Missing required fields: usuario_id, monto, plazo_meses');
      }

      // Validate amount
      const amountValidation = await this.creditsValidator.validateAmount(
        usuario_id,
        monto,
        CreditType.NORMAL
      );
      if (!amountValidation.es_elegible) {
        throw new ValidationError(amountValidation.razon_rechazo!);
      }

      // Validate term
      const termValidation = await this.creditsValidator.validateTerm(plazo_meses, CreditType.NORMAL);
      if (!termValidation.es_elegible) {
        throw new ValidationError(termValidation.razon_rechazo!);
      }

      const simulation = await this.creditsService.simulateNormalCredit(
        usuario_id,
        monto,
        plazo_meses
      );

      res.json({
        usuario_id,
        tipo_credito: 'normal',
        simulacion: simulation,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Request quick credit
   */
  async requestQuickCredit(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { usuario_id, monto, plazo_dias } = req.body;

      if (!usuario_id || !monto || !plazo_dias) {
        throw new ValidationError('Missing required fields: usuario_id, monto, plazo_dias');
      }

      // Validate eligibility
      const eligibility = await this.creditsValidator.validateQuickCreditEligibility(usuario_id);
      if (!eligibility.es_elegible) {
        throw new ValidationError(`Not eligible for quick credit: ${eligibility.razon_rechazo}`);
      }

      // Create credit request
      const credit = await this.creditsService.createQuickCredit({
        usuario_id,
        tipo_credito: CreditType.QUICK,
        monto_solicitado: monto,
        plazo_dias,
      });

      res.status(201).json({
        exito: true,
        credito: {
          id_credito: credit.id_credito,
          estado: credit.estado,
          monto_solicitado: credit.monto_solicitado,
          monto_total: credit.monto_total,
          tasa_tea: credit.tasa_tea,
          tasa_cft: credit.tasa_cft,
          cuotas: credit.cuotas,
          fecha_vencimiento: credit.fecha_vencimiento,
        },
        siguiente_paso: 'revisar_terminos_y_aceptar',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Request normal credit
   */
  async requestNormalCredit(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { usuario_id, monto, plazo_meses } = req.body;

      if (!usuario_id || !monto || !plazo_meses) {
        throw new ValidationError('Missing required fields: usuario_id, monto, plazo_meses');
      }

      // Validate eligibility
      const eligibility = await this.creditsValidator.validateNormalCreditEligibility(usuario_id);
      if (!eligibility.es_elegible) {
        throw new ValidationError(`Not eligible for normal credit: ${eligibility.razon_rechazo}`);
      }

      // Create credit request
      const credit = await this.creditsService.createNormalCredit({
        usuario_id,
        tipo_credito: CreditType.NORMAL,
        monto_solicitado: monto,
        plazo_dias: plazo_meses * 30,
      });

      res.status(201).json({
        exito: true,
        credito: {
          id_credito: credit.id_credito,
          estado: credit.estado,
          monto_solicitado: credit.monto_solicitado,
          monto_total: credit.monto_total,
          tasa_tea: credit.tasa_tea,
          tasa_cft: credit.tasa_cft,
          cuotas: credit.cuotas,
          fecha_vencimiento: credit.fecha_vencimiento,
        },
        siguiente_paso: 'en_evaluacion',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Accept credit terms and disburse
   */
  async acceptCreditAndDisburse(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id_credito, usuario_id } = req.body;

      if (!id_credito || !usuario_id) {
        throw new ValidationError('Missing required fields: id_credito, usuario_id');
      }

      // Approve and disburse
      const credit = await this.creditsService.approveCreditAndDisburse(id_credito);

      res.json({
        exito: true,
        mensaje: 'Crédito desembolsado exitosamente',
        credito: {
          id_credito: credit.id_credito,
          estado: credit.estado,
          fecha_desembolso: credit.fecha_desembolso,
          monto_desembolsado: credit.monto_solicitado,
          proximas_cuotas: credit.cuotas,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get user's credits
   */
  async getUserCredits(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { usuario_id } = req.params;

      if (!usuario_id) {
        throw new ValidationError('Missing required parameter: usuario_id');
      }

      const credits = await this.creditsRepository.findCreditsByUserId(usuario_id);

      res.json({
        usuario_id,
        cantidad_creditos: credits.length,
        creditos: credits.map((c) => ({
          id_credito: c.id_credito,
          tipo: c.tipo_credito,
          estado: c.estado,
          monto_solicitado: c.monto_solicitado,
          monto_total: c.monto_total,
          tasa_tea: c.tasa_tea,
          tasa_cft: c.tasa_cft,
          cuotas_totales: c.cuotas,
          fecha_creacion: c.fecha_creacion,
          fecha_vencimiento: c.fecha_vencimiento,
          fecha_desembolso: c.fecha_desembolso,
        })),
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get credit detail
   */
  async getCreditDetail(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id_credito } = req.params;

      if (!id_credito) {
        throw new ValidationError('Missing required parameter: id_credito');
      }

      const credit = await this.creditsRepository.findCreditById(id_credito);
      if (!credit) {
        throw new NotFoundError(`Credit ${id_credito} not found`);
      }

      const installments = await this.creditsRepository.getInstallmentsByCredit(id_credito);

      res.json({
        credito: {
          id_credito: credit.id_credito,
          usuario_id: credit.usuario_id,
          tipo: credit.tipo_credito,
          estado: credit.estado,
          monto_solicitado: credit.monto_solicitado,
          monto_total: credit.monto_total,
          tasa_tea: credit.tasa_tea,
          tasa_cft: credit.tasa_cft,
          cuotas_totales: credit.cuotas,
          fecha_creacion: credit.fecha_creacion,
          fecha_desembolso: credit.fecha_desembolso,
          fecha_vencimiento: credit.fecha_vencimiento,
        },
        cuotas: installments.map((c) => ({
          id_cuota: c.id_cuota,
          numero: c.nro_cuota,
          importe: c.importe_cuota,
          fecha_vencimiento: c.fecha_vencimiento,
          estado: c.estado,
          fecha_pago: c.fecha_pago,
        })),
      });
    } catch (error) {
      next(error);
    }
  }
}

export default new CreditsHandler();
