export enum CreditType {
  QUICK = 'rapido',
  NORMAL = 'normal',
}

export enum CreditStatus {
  PREAPPROVED = 'preaprobado',
  APPROVED = 'aprobado',
  DISBURSED = 'desembolsado',
  IN_PROGRESS = 'en_curso',
  PAID = 'pagado',
  DEFAULT = 'en_mora',
  CANCELED = 'cancelado',
}

export enum InstallmentStatus {
  PENDING = 'pendiente',
  PAID = 'pagada',
  UNPAID = 'impaga',
  RETRYING = 'reintentando',
}

export interface Credit {
  id_credito: string;
  usuario_id: string;
  tipo_credito: CreditType;
  monto_solicitado: number;
  monto_total: number;
  plazo_dias: number;
  tasa_tea: number;
  tasa_cft: number;
  estado: CreditStatus;
  fecha_desembolso: Date | null;
  fecha_vencimiento: Date;
  cuotas: number;
  fecha_creacion: Date;
  fecha_actualizacion: Date;
}

export interface Installment {
  id_cuota: string;
  id_credito: string;
  nro_cuota: number;
  importe_cuota: number;
  fecha_vencimiento: Date;
  estado: InstallmentStatus;
  fecha_pago: Date | null;
}

export interface UserAccount {
  usuario_id: string;
  kyc_completo: boolean;
  fecha_registro: Date;
  saldo_disponible: number;
  ingresos_declarados: number | null;
  historial_mora: boolean;
  score_externo: number | null;
  fecha_actualizacion: Date;
}

export interface CreditCalculation {
  monto_faltante: number;
  tasa_tea: number;
  tasa_cft: number;
  monto_intereses: number;
  gastos_administrativos: number;
  monto_total: number;
  plan_cuotas: InstallmentPlan[];
}

export interface InstallmentPlan {
  nro_cuota: number;
  importe: number;
  fecha_vencimiento: Date;
}

export interface CreditEligibility {
  es_elegible: boolean;
  razon_rechazo?: string;
  limites_maximos?: {
    monto_maximo: number;
    plazo_minimo?: number;
    plazo_maximo?: number;
  };
}

export interface CreditRequest {
  usuario_id: string;
  tipo_credito: CreditType;
  monto_solicitado: number;
  plazo_dias: number;
}

export interface CreditSimulation {
  tipo_credito: CreditType;
  monto_solicitado: number;
  plazo_dias: number;
  cuotas_totales: number;
  tasa_tea: number;
  tasa_cft: number;
  monto_total: number;
  costo_financiero: number;
  plan_cuotas: InstallmentPlan[];
}

export interface BankingAPIResponse {
  exito: boolean;
  transaccion_id?: string;
  monto: number;
  fecha: Date;
  saldo_resultante: number;
  razon_fallo?: string;
}

export interface AuditLog {
  id_log: string;
  id_credito: string;
  usuario_id: string;
  tipo_evento: string;
  detalles: Record<string, any>;
  ip: string;
  dispositivo: string;
  fecha_creacion: Date;
}

export interface JWTPayload {
  usuario_id: string;
  email?: string;
  iat?: number;
  exp?: number;
}

export enum TransferStatus {
  PENDIENTE = 'pendiente',
  EN_PROCESO = 'en_proceso',
  ACREDITADA = 'acreditada',
  FALLIDA = 'fallida',
}

export interface Transfer {
  id_transferencia: string;
  usuario_id_origen: string;
  usuario_id_destino?: string;
  cbu_destino?: string;
  monto: number;
  referencia?: string;
  estado: TransferStatus;
  comprobante_json?: Record<string, any>;
  fecha_creacion: Date;
  fecha_acreditacion?: Date;
  fecha_actualizacion?: Date;
}

export interface Comprobante {
  id_comprobante: string;
  id_transferencia: string;
  numero_comprobante: string;
  fecha_hora: Date;
  monto: number;
  destinatario_alias?: string;
  destinatario_cbu?: string;
  estado: TransferStatus;
  pdf_url?: string;
  estado_descarga: 'generado' | 'disponible' | 'expirado';
  fecha_expiracion?: Date;
  fecha_creacion: Date;
}

export interface ComprobanteDetail {
  numero_comprobante: string;
  fecha_hora: Date;
  monto: number;
  remitente_alias: string;
  destinatario_alias?: string;
  destinatario_cbu?: string;
  referencia?: string;
  estado: TransferStatus;
  compartible: boolean;
  descargable: boolean;
}
