import { BankingAPIResponse, CBUValidationResult, ExternalTransferRequest, ExternalTransferResult, TransferStatus } from '@/types/index.js';
import UserAccountsService from './UserAccountsService.js';
import { v4 as uuidv4 } from 'uuid';
import { ValidationError } from '@/errors/AppError.js';

/**
 * Mock Banking API Service
 * Simulates internal banking operations for credit disbursement and payment processing
 */
export class BankingAPI {
  private userAccountsService = UserAccountsService;

  /**
   * Simulate disbursement of credit to user's wallet
   * In a real system, this would call actual banking infrastructure
   */
  async disburseCredit(userId: string, amount: number): Promise<BankingAPIResponse> {
    try {
      const account = await this.userAccountsService.getUserAccount(userId);

      // Simulate successful disbursement
      const updatedAccount = await this.userAccountsService.addFunds(userId, amount);

      return {
        exito: true,
        transaccion_id: uuidv4(),
        monto: amount,
        fecha: new Date(),
        saldo_resultante: updatedAccount.saldo_disponible,
      };
    } catch (error) {
      return {
        exito: false,
        monto: amount,
        fecha: new Date(),
        saldo_resultante: 0,
        razon_fallo: `Disbursement failed: ${error}`,
      };
    }
  }

  /**
   * Simulate automatic debit for installment payment
   * In a real system, this would process actual bank transfers
   */
  async processInstallmentPayment(userId: string, amount: number): Promise<BankingAPIResponse> {
    try {
      const account = await this.userAccountsService.getUserAccount(userId);

      if (account.saldo_disponible < amount) {
        return {
          exito: false,
          monto: amount,
          fecha: new Date(),
          saldo_resultante: account.saldo_disponible,
          razon_fallo: 'Insufficient balance for payment',
        };
      }

      const updatedAccount = await this.userAccountsService.removeFunds(userId, amount);

      return {
        exito: true,
        transaccion_id: uuidv4(),
        monto: amount,
        fecha: new Date(),
        saldo_resultante: updatedAccount.saldo_disponible,
      };
    } catch (error) {
      return {
        exito: false,
        monto: amount,
        fecha: new Date(),
        saldo_resultante: 0,
        razon_fallo: `Payment processing failed: ${error}`,
      };
    }
  }

  /**
   * Simulate checking available funds for a user
   * In a real system, this would query the banking system
   */
  async checkAvailableFunds(userId: string): Promise<number> {
    try {
      const balance = await this.userAccountsService.getBalance(userId);
      return balance;
    } catch (error) {
      throw new Error(`Failed to check available funds: ${error}`);
    }
  }

  /**
   * Simulate retry mechanism for failed payments
   * In a real system, this would schedule retry with banking infrastructure
   */
  async schedulePaymentRetry(userId: string, amount: number, delayHours: number = 48): Promise<{
    retryScheduled: boolean;
    scheduledFor: Date;
  }> {
    const scheduledFor = new Date();
    scheduledFor.setHours(scheduledFor.getHours() + delayHours);

    return {
      retryScheduled: true,
      scheduledFor,
    };
  }

  /**
   * Simulate transferring funds between accounts (for transfers)
   */
  async transferFunds(
    fromUserId: string,
    toUserId: string,
    amount: number
  ): Promise<BankingAPIResponse> {
    try {
      // Check if sender has sufficient funds
      const senderBalance = await this.userAccountsService.getBalance(fromUserId);
      if (senderBalance < amount) {
        return {
          exito: false,
          monto: amount,
          fecha: new Date(),
          saldo_resultante: senderBalance,
          razon_fallo: 'Sender has insufficient balance',
        };
      }

      // Remove funds from sender
      const senderUpdated = await this.userAccountsService.removeFunds(fromUserId, amount);

      // Add funds to recipient
      const recipientUpdated = await this.userAccountsService.addFunds(toUserId, amount);

      return {
        exito: true,
        transaccion_id: uuidv4(),
        monto: amount,
        fecha: new Date(),
        saldo_resultante: senderUpdated.saldo_disponible,
      };
    } catch (error) {
      return {
        exito: false,
        monto: amount,
        fecha: new Date(),
        saldo_resultante: 0,
        razon_fallo: `Transfer failed: ${error}`,
      };
    }
  }

  /**
   * Simulate batch processing of multiple payments (for scheduled payments)
   */
  async processBatchPayments(
    payments: { userId: string; amount: number }[]
  ): Promise<BankingAPIResponse[]> {
    return Promise.all(
      payments.map((payment) => this.processInstallmentPayment(payment.userId, payment.amount))
    );
  }

  /**
   * Generate transaction receipt/confirmation
   */
  generateReceipt(
    transactionId: string,
    type: 'disbursement' | 'payment' | 'transfer',
    amount: number,
    userId: string
  ): string {
    return `
RECIBO DE ${type.toUpperCase()}
================================
ID Transacción: ${transactionId}
Usuario: ${userId}
Monto: $${amount}
Fecha: ${new Date().toISOString()}
================================
    `.trim();
  }

  // CBU/CVU Validation Methods
  /**
   * Validate CBU (Código Bancario Uniforme) or CVU (Código Virtual Uniforme)
   * CBU: 22 digits (Argentine standard)
   * CVU: 10 digits (Virtual account number)
   */
  validateCBUFormat(cbu: string): CBUValidationResult {
    // Remove spaces and special characters
    const cleanCBU = cbu.replace(/\s+/g, '');

    // Check if CBU is 22 digits (standard format)
    if (!/^\d{22}$/.test(cleanCBU)) {
      return {
        es_valido: false,
        cbu: cleanCBU,
        activo: false,
        razon_invalido: 'CBU must be 22 digits',
      };
    }

    // Extract bank code (first 3 digits)
    const bankCode = cleanCBU.substring(0, 3);

    // Mock bank mapping (in real system, would query BCRA database)
    const bankMap: Record<string, string> = {
      '000': 'Banco Central',
      '001': 'Banco Nación',
      '002': 'Banco Provincia',
      '005': 'Banco Diagonal',
      '006': 'BBVA Francés',
      '007': 'Banco Hipotecario',
      '011': 'Banco Santander',
      '014': 'Banco Supvielle',
      '016': 'Citibank',
      '017': 'Banco Galicia',
      '020': 'Banco Tornquist',
      '023': 'Banco Macri',
      '026': 'Banco Invex',
      '027': 'Bansí',
      '028': 'Banco Hipotecario Federal',
      '029': 'Coficred',
      '030': 'Intercam',
      '031': 'Banco Icbcl',
      '032': 'Banco Credicorp',
      '033': 'Banco Bankboston',
      '034': 'Banco Bamsa',
      '035': 'Banco Finterra',
      '036': 'Rabobank',
      '037': 'Banco Monex',
      '038': 'Hsbc',
      '039': 'Banco Bice',
      '040': 'Banco Roela',
      '041': 'Banca Més',
      '042': 'Banco Yadá',
      '043': 'Banco del Inversiones',
      '044': 'Nuevo Banco Comercial',
      '045': 'Mercado Pago',
      '046': 'Financial Bank',
    };

    const bancoDB = bankMap[bankCode] || 'Banco Desconocido';

    return {
      es_valido: true,
      cbu: cleanCBU,
      banco: bancoDB,
      activo: true,
    };
  }

  /**
   * Validate CVU (10 digits)
   */
  validateCVUFormat(cvu: string): CBUValidationResult {
    const cleanCVU = cvu.replace(/\s+/g, '');

    if (!/^\d{10}$/.test(cleanCVU)) {
      return {
        es_valido: false,
        cbu: cleanCVU,
        activo: false,
        razon_invalido: 'CVU must be 10 digits',
      };
    }

    return {
      es_valido: true,
      cbu: cleanCVU,
      activo: true,
      alias: 'alias.default', // In real system, would query actual alias
    };
  }

  /**
   * Validate CBU or CVU
   */
  validateExternalAccount(cuenta: string): CBUValidationResult {
    const cleanCuenta = cuenta.replace(/\s+/g, '');

    if (cleanCuenta.length === 22) {
      return this.validateCBUFormat(cleanCuenta);
    } else if (cleanCuenta.length === 10) {
      return this.validateCVUFormat(cleanCuenta);
    } else {
      return {
        es_valido: false,
        cbu: cleanCuenta,
        activo: false,
        razon_invalido: 'Account number must be 22 digits (CBU) or 10 digits (CVU)',
      };
    }
  }

  /**
   * Check if external account is active (mock implementation)
   */
  isExternalAccountActive(cbu: string): boolean {
    // In real system, would check clearing house database
    // For mock, return true if format is valid and not in blocked list
    const blockedAccounts = [
      '00000000000000000000001', // Test blocked account
    ];

    return !blockedAccounts.includes(cbu);
  }

  // External Transfer Methods
  /**
   * Execute transfer to external CBU/CVU account
   * In real system, would communicate with clearing house (CAJA, LICH, etc)
   */
  async executeExternalTransfer(request: ExternalTransferRequest): Promise<ExternalTransferResult> {
    try {
      // Validate CBU/CVU format
      const validation = this.validateExternalAccount(request.cbu_destino);
      if (!validation.es_valido) {
        return {
          exito: false,
          id_transferencia: uuidv4(),
          cbu_origen: 'unknown',
          cbu_destino: request.cbu_destino,
          monto: request.monto,
          transaccion_numero: '',
          fecha_transaccion: new Date(),
          estado: TransferStatus.FALLIDA,
          razon_fallo: validation.razon_invalido || 'Invalid account format',
        };
      }

      // Check if account is active
      if (!this.isExternalAccountActive(validation.cbu)) {
        return {
          exito: false,
          id_transferencia: uuidv4(),
          cbu_origen: 'unknown',
          cbu_destino: request.cbu_destino,
          monto: request.monto,
          transaccion_numero: '',
          fecha_transaccion: new Date(),
          estado: TransferStatus.FALLIDA,
          razon_fallo: 'Destination account is inactive',
        };
      }

      // Verify sender has sufficient funds
      const senderBalance = await this.userAccountsService.getBalance(request.usuario_id);
      if (senderBalance < request.monto) {
        return {
          exito: false,
          id_transferencia: uuidv4(),
          cbu_origen: 'unknown',
          cbu_destino: request.cbu_destino,
          monto: request.monto,
          transaccion_numero: '',
          fecha_transaccion: new Date(),
          estado: TransferStatus.FALLIDA,
          razon_fallo: 'Insufficient balance',
        };
      }

      // Debit from sender
      const transferId = uuidv4();
      const transactionNumber = `EXT${Date.now()}${Math.random().toString(36).substr(2, 9)}`;
      const now = new Date();

      try {
        await this.userAccountsService.removeFunds(request.usuario_id, request.monto);

        // In real system, would submit to clearing house and return pending status
        // For mock, simulate immediate success
        return {
          exito: true,
          id_transferencia: transferId,
          cbu_origen: 'Tu CBU',
          cbu_destino: validation.cbu,
          monto: request.monto,
          transaccion_numero: transactionNumber,
          fecha_transaccion: now,
          estado: TransferStatus.ACREDITADA,
          comprobante: {
            numero: transactionNumber,
            fecha: now,
            referencia: request.referencia,
          },
        };
      } catch (error) {
        // Revert debit if transfer fails
        await this.userAccountsService.addFunds(request.usuario_id, request.monto);

        return {
          exito: false,
          id_transferencia: transferId,
          cbu_origen: 'unknown',
          cbu_destino: request.cbu_destino,
          monto: request.monto,
          transaccion_numero: transactionNumber,
          fecha_transaccion: now,
          estado: TransferStatus.FALLIDA,
          razon_fallo: `Transfer execution failed: ${error}`,
        };
      }
    } catch (error) {
      throw new ValidationError(`External transfer error: ${error}`);
    }
  }

  /**
   * Get transfer status (mock implementation)
   * In real system, would query clearing house
   */
  async getExternalTransferStatus(transactionNumber: string): Promise<TransferStatus> {
    // In mock, transfers are immediately successful
    // In real system, would check with CAJA/LICH/ALET
    return TransferStatus.ACREDITADA;
  }

  /**
   * Validate transfer limit before execution
   */
  async validateTransferLimit(userId: string, monto: number): Promise<boolean> {
    try {
      const limite = await this.userAccountsService.getTransferLimit(userId);
      return monto <= limite;
    } catch (error) {
      throw new ValidationError(`Failed to validate transfer limit: ${error}`);
    }
  }
}

export default new BankingAPI();
