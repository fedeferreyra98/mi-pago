import { Request, Response, NextFunction } from 'express';
import UserAccountsService from '@/services/UserAccountsService.js';
import { ValidationError, NotFoundError } from '@/errors/AppError.js';

export class UserAccountsHandler {
  private userAccountsService = UserAccountsService;

  /**
   * Create a new user account
   */
  async createAccount(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { usuario_id } = req.body;

      if (!usuario_id) {
        throw new ValidationError('Missing required field: usuario_id');
      }

      const account = await this.userAccountsService.createUserAccount(usuario_id);

      res.status(201).json({
        exito: true,
        cuenta: {
          usuario_id: account.usuario_id,
          kyc_completo: account.kyc_completo,
          saldo_disponible: account.saldo_disponible,
          fecha_registro: account.fecha_registro,
          fecha_actualizacion: account.fecha_actualizacion,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get user account information
   */
  async getAccount(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { usuario_id } = req.params;

      if (!usuario_id) {
        throw new ValidationError('Missing required parameter: usuario_id');
      }

      const account = await this.userAccountsService.getUserAccount(usuario_id);

      res.json({
        usuario_id: account.usuario_id,
        kyc_completo: account.kyc_completo,
        saldo_disponible: account.saldo_disponible,
        ingresos_declarados: account.ingresos_declarados,
        historial_mora: account.historial_mora,
        fecha_registro: account.fecha_registro,
        fecha_actualizacion: account.fecha_actualizacion,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Add funds to account (simulating deposits)
   */
  async addFunds(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { usuario_id, monto } = req.body;

      if (!usuario_id || !monto) {
        throw new ValidationError('Missing required fields: usuario_id, monto');
      }

      const updatedAccount = await this.userAccountsService.addFunds(usuario_id, monto);

      res.json({
        exito: true,
        usuario_id,
        monto_agregado: monto,
        nuevo_saldo: updatedAccount.saldo_disponible,
        fecha_actualizacion: updatedAccount.fecha_actualizacion,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get account balance
   */
  async getBalance(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { usuario_id } = req.params;

      if (!usuario_id) {
        throw new ValidationError('Missing required parameter: usuario_id');
      }

      const balance = await this.userAccountsService.getBalance(usuario_id);

      res.json({
        usuario_id,
        saldo_disponible: balance,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Complete KYC process
   */
  async completeKYC(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { usuario_id } = req.body;

      if (!usuario_id) {
        throw new ValidationError('Missing required field: usuario_id');
      }

      const updatedAccount = await this.userAccountsService.completeKYC(usuario_id);

      res.json({
        exito: true,
        usuario_id,
        kyc_completo: updatedAccount.kyc_completo,
        mensaje: 'KYC completado exitosamente',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Declare income
   */
  async declareIncome(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { usuario_id, ingresos_mensuales } = req.body;

      if (!usuario_id || !ingresos_mensuales) {
        throw new ValidationError('Missing required fields: usuario_id, ingresos_mensuales');
      }

      const updatedAccount = await this.userAccountsService.declareIncome(
        usuario_id,
        ingresos_mensuales
      );

      res.json({
        exito: true,
        usuario_id,
        ingresos_declarados: updatedAccount.ingresos_declarados,
        mensaje: 'Ingresos declarados exitosamente',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Set external credit score
   */
  async setExternalScore(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { usuario_id, score } = req.body;

      if (!usuario_id || score === undefined) {
        throw new ValidationError('Missing required fields: usuario_id, score');
      }

      const updatedAccount = await this.userAccountsService.setExternalScore(usuario_id, score);

      res.json({
        exito: true,
        usuario_id,
        score_externo: updatedAccount.score_externo,
        mensaje: 'Score externo establecido',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Check account eligibility requirements
   */
  async checkEligibilityRequirements(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { usuario_id } = req.params;

      if (!usuario_id) {
        throw new ValidationError('Missing required parameter: usuario_id');
      }

      const requirements = await this.userAccountsService.verifyEligibilityRequirements(usuario_id);

      res.json({
        usuario_id,
        requisitos_elegibilidad: {
          kyc_completo: requirements.kycCompleted,
          antiguedad_dias: requirements.accountAgeDays,
          antiguedad_suficiente: requirements.accountAgeDays >= 30,
          sin_mora: !requirements.hasDefaultHistory,
          saldo_disponible: requirements.balance,
        },
        cumple_requisitos: requirements.kycCompleted && requirements.accountAgeDays >= 30 && !requirements.hasDefaultHistory,
      });
    } catch (error) {
      next(error);
    }
  }
}

export default new UserAccountsHandler();
