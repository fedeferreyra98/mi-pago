import { Credit, CreditType, CreditStatus, CreditCalculation, InstallmentPlan, CreditSimulation, CreditRequest } from '@/types/index.js';
import { config } from '@/config/config.js';
import CreditsRepository from '@/repositories/CreditsRepository.js';
import UserAccountsRepository from '@/repositories/UserAccountsRepository.js';
import { ValidationError, InsufficientFundsError } from '@/errors/AppError.js';

export class CreditsService {
  private creditsRepository = CreditsRepository;
  private userAccountsRepository = UserAccountsRepository;

  // Quick credit interest rates based on placeholder terms
  private quickCreditRates = {
    30: 110,
    60: 115,
    90: 120,
  };

  // Normal credit rates based on placeholder terms
  private normalCreditRates = {
    3: 85,
    6: 90,
    12: 95,
  };

  // Administrative charges as percentage
  private adminChargePercentage = 2;
  private cftMultiplier = 1.15; // CFT is approximately 15% higher than TEA

  async simulateQuickCredit(userId: string, missingAmount: number, termDays: number): Promise<CreditSimulation> {
    if (!Object.keys(this.quickCreditRates).includes(termDays.toString())) {
      throw new ValidationError('Invalid term for quick credit. Allowed: 30, 60, 90 days');
    }

    const tea = this.quickCreditRates[termDays as keyof typeof this.quickCreditRates];
    const cft = Math.round(tea * this.cftMultiplier);
    const calculation = this.calculateCredit(missingAmount, tea, cft, termDays, 'quick');

    return {
      tipo_credito: CreditType.QUICK,
      monto_solicitado: missingAmount,
      plazo_dias: termDays,
      cuotas_totales: calculation.plan_cuotas.length,
      tasa_tea: tea,
      tasa_cft: cft,
      monto_total: calculation.monto_total,
      costo_financiero: calculation.monto_intereses + calculation.gastos_administrativos,
      plan_cuotas: calculation.plan_cuotas,
    };
  }

  async simulateNormalCredit(userId: string, amount: number, termMonths: number): Promise<CreditSimulation> {
    if (!Object.keys(this.normalCreditRates).includes(termMonths.toString())) {
      throw new ValidationError('Invalid term for normal credit. Allowed: 3, 6, 9, 12 months');
    }

    const tea = this.normalCreditRates[termMonths as keyof typeof this.normalCreditRates];
    const cft = Math.round(tea * this.cftMultiplier);
    const termDays = termMonths * 30;

    const calculation = this.calculateCredit(amount, tea, cft, termDays, 'normal');

    return {
      tipo_credito: CreditType.NORMAL,
      monto_solicitado: amount,
      plazo_dias: termDays,
      cuotas_totales: termMonths,
      tasa_tea: tea,
      tasa_cft: cft,
      monto_total: calculation.monto_total,
      costo_financiero: calculation.monto_intereses + calculation.gastos_administrativos,
      plan_cuotas: calculation.plan_cuotas,
    };
  }

  async createQuickCredit(request: CreditRequest): Promise<Credit> {
    if (request.tipo_credito !== CreditType.QUICK) {
      throw new ValidationError('Invalid credit type for quick credit creation');
    }

    const simulation = await this.simulateQuickCredit(
      request.usuario_id,
      request.monto_solicitado,
      request.plazo_dias
    );

    const vencimientoDate = new Date();
    vencimientoDate.setDate(vencimientoDate.getDate() + request.plazo_dias);

    const credit = await this.creditsRepository.createCredit({
      usuario_id: request.usuario_id,
      tipo_credito: CreditType.QUICK,
      monto_solicitado: request.monto_solicitado,
      monto_total: simulation.monto_total,
      plazo_dias: request.plazo_dias,
      tasa_tea: simulation.tasa_tea,
      tasa_cft: simulation.tasa_cft,
      estado: CreditStatus.PREAPPROVED,
      fecha_desembolso: null,
      fecha_vencimiento: vencimientoDate,
      cuotas: simulation.cuotas_totales,
    });

    // Create installment plan
    const installmentData = simulation.plan_cuotas.map((plan) => ({
      id_credito: credit.id_credito,
      nro_cuota: plan.nro_cuota,
      importe_cuota: plan.importe,
      fecha_vencimiento: plan.fecha_vencimiento,
      estado: 'pendiente' as const,
      fecha_pago: null,
    }));

    await this.creditsRepository.createInstallmentPlan(credit.id_credito, installmentData);

    return credit;
  }

  async createNormalCredit(request: CreditRequest): Promise<Credit> {
    if (request.tipo_credito !== CreditType.NORMAL) {
      throw new ValidationError('Invalid credit type for normal credit creation');
    }

    const termMonths = Math.floor(request.plazo_dias / 30);
    if (![3, 6, 9, 12].includes(termMonths)) {
      throw new ValidationError('Invalid term for normal credit. Allowed: 3, 6, 9, 12 months');
    }

    const simulation = await this.simulateNormalCredit(
      request.usuario_id,
      request.monto_solicitado,
      termMonths
    );

    const vencimientoDate = new Date();
    vencimientoDate.setMonth(vencimientoDate.getMonth() + termMonths);

    const credit = await this.creditsRepository.createCredit({
      usuario_id: request.usuario_id,
      tipo_credito: CreditType.NORMAL,
      monto_solicitado: request.monto_solicitado,
      monto_total: simulation.monto_total,
      plazo_dias: request.plazo_dias,
      tasa_tea: simulation.tasa_tea,
      tasa_cft: simulation.tasa_cft,
      estado: CreditStatus.PREAPPROVED,
      fecha_desembolso: null,
      fecha_vencimiento: vencimientoDate,
      cuotas: simulation.cuotas_totales,
    });

    // Create installment plan
    const installmentData = simulation.plan_cuotas.map((plan) => ({
      id_credito: credit.id_credito,
      nro_cuota: plan.nro_cuota,
      importe_cuota: plan.importe,
      fecha_vencimiento: plan.fecha_vencimiento,
      estado: 'pendiente' as const,
      fecha_pago: null,
    }));

    await this.creditsRepository.createInstallmentPlan(credit.id_credito, installmentData);

    return credit;
  }

  async approveCreditAndDisburse(creditId: string): Promise<Credit> {
    const credit = await this.creditsRepository.findCreditById(creditId);
    if (!credit) {
      throw new ValidationError(`Credit ${creditId} not found`);
    }

    // Check user balance before disbursement
    const userBalance = await this.userAccountsRepository.getBalance(credit.usuario_id);
    if (userBalance < credit.monto_solicitado) {
      throw new InsufficientFundsError(
        `Insufficient funds to disburse credit. Available: ${userBalance}, Required: ${credit.monto_solicitado}`
      );
    }

    // Deduct from balance
    const newBalance = userBalance - credit.monto_solicitado;
    await this.userAccountsRepository.updateBalance(credit.usuario_id, newBalance);

    // Update credit status
    const updatedCredit = await this.creditsRepository.updateCredit(creditId, {
      estado: CreditStatus.IN_PROGRESS,
      fecha_desembolso: new Date(),
    });

    return updatedCredit;
  }

  private calculateCredit(
    principal: number,
    tea: number,
    cft: number,
    termDays: number,
    type: 'quick' | 'normal'
  ): CreditCalculation {
    // Calculate interest based on TEA
    const yearFraction = termDays / 365;
    const interestRate = tea / 100;
    const interest = principal * interestRate * yearFraction;

    // Calculate administrative charges
    const adminCharges = principal * (this.adminChargePercentage / 100);

    // Total amount to repay
    const totalAmount = principal + interest + adminCharges;

    // Number of installments
    const numInstallments = type === 'quick'
      ? Math.ceil(termDays / 30)
      : Math.floor(termDays / 30);

    // Generate installment plan
    const plan: InstallmentPlan[] = [];
    const installmentAmount = totalAmount / numInstallments;

    const startDate = new Date();
    const daysBetweenPayments = type === 'quick' ? 30 : 30;

    for (let i = 1; i <= numInstallments; i++) {
      const dueDate = new Date(startDate);
      dueDate.setDate(dueDate.getDate() + i * daysBetweenPayments);

      plan.push({
        nro_cuota: i,
        importe: i === numInstallments
          ? totalAmount - installmentAmount * (numInstallments - 1)
          : installmentAmount,
        fecha_vencimiento: dueDate,
      });
    }

    return {
      monto_faltante: principal,
      tasa_tea: tea,
      tasa_cft: cft,
      monto_intereses: Math.round(interest),
      gastos_administrativos: Math.round(adminCharges),
      monto_total: Math.round(totalAmount),
      plan_cuotas: plan,
    };
  }

  async getDebtToIncomeRatio(userId: string): Promise<number> {
    const activeCredits = await this.creditsRepository.getActiveCreditsByUser(userId);
    const totalMonthlyDebt = activeCredits.reduce((sum, credit) => {
      const monthlyPayment = credit.monto_total / (credit.cuotas || 1);
      return sum + monthlyPayment;
    }, 0);

    const income = await this.userAccountsRepository.getDeclaredIncome(userId) || 0;
    if (income === 0) return 0;

    return (totalMonthlyDebt / income) * 100;
  }
}

export default new CreditsService();
