-- Mi Pago Database Schema Updates
-- This migration adds support for enhanced security features, KYC document management, and external transfers
-- Run this migration after the initial schema setup

-- =====================================================================
-- 1. ALTER user_accounts TABLE - Add security and KYC fields
-- =====================================================================

-- Add password hash column for credential validation
ALTER TABLE user_accounts
ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255);

-- Add account blocking/security columns
ALTER TABLE user_accounts
ADD COLUMN IF NOT EXISTS bloqueado BOOLEAN DEFAULT FALSE;

ALTER TABLE user_accounts
ADD COLUMN IF NOT EXISTS intentos_fallidos INTEGER DEFAULT 0;

ALTER TABLE user_accounts
ADD COLUMN IF NOT EXISTS fecha_proximo_intento TIMESTAMP;

-- Add email column for password reset and communications
ALTER TABLE user_accounts
ADD COLUMN IF NOT EXISTS email VARCHAR(255) UNIQUE;

-- Add KYC status column for tracking approval workflow
ALTER TABLE user_accounts
ADD COLUMN IF NOT EXISTS kyc_status VARCHAR(50) DEFAULT 'pendiente';
-- Valid values: 'pendiente', 'en_revision', 'aprobado', 'rechazado'

-- Add transfer limit column (dynamic based on KYC status)
ALTER TABLE user_accounts
ADD COLUMN IF NOT EXISTS limite_transferencia DECIMAL(15, 2) DEFAULT 10000;

-- =====================================================================
-- 2. CREATE kyc_documents TABLE - Store KYC document uploads
-- =====================================================================

CREATE TABLE IF NOT EXISTS kyc_documents (
  id_documento UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id UUID NOT NULL REFERENCES user_accounts(usuario_id) ON DELETE CASCADE,
  tipo_documento VARCHAR(50) NOT NULL,
  -- Valid types: 'dni', 'selfie', 'comprobante_domicilio'
  url_documento TEXT NOT NULL,
  fecha_carga TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  estado_validacion VARCHAR(50) NOT NULL DEFAULT 'pendiente',
  -- Valid states: 'pendiente', 'en_revision', 'aprobado', 'rechazado'
  motivo_rechazo TEXT,
  fecha_validacion TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_usuario_id (usuario_id),
  INDEX idx_tipo_documento (tipo_documento),
  INDEX idx_estado_validacion (estado_validacion)
);

-- =====================================================================
-- 3. CREATE password_reset_tokens TABLE - Password recovery flow
-- =====================================================================

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  token VARCHAR(255) PRIMARY KEY,
  usuario_id UUID NOT NULL REFERENCES user_accounts(usuario_id) ON DELETE CASCADE,
  fecha_creacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  fecha_vencimiento TIMESTAMP NOT NULL,
  -- Token expires in 24 hours by default
  utilizado BOOLEAN DEFAULT FALSE,
  fecha_utilizacion TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_usuario_id (usuario_id),
  INDEX idx_utilizado (utilizado),
  INDEX idx_fecha_vencimiento (fecha_vencimiento)
);

-- =====================================================================
-- 4. ALTER transfers TABLE - Add external transfer fields
-- =====================================================================

-- If transfers table doesn't have these fields, add them:
ALTER TABLE transfers
ADD COLUMN IF NOT EXISTS cbu_destino VARCHAR(22);

ALTER TABLE transfers
ADD COLUMN IF NOT EXISTS alias_destino VARCHAR(255);

ALTER TABLE transfers
ADD COLUMN IF NOT EXISTS transaccion_numero VARCHAR(100) UNIQUE;

ALTER TABLE transfers
ADD COLUMN IF NOT EXISTS referencia VARCHAR(255);

-- =====================================================================
-- 5. CREATE transfer_details TABLE - Extended transfer information
-- =====================================================================

CREATE TABLE IF NOT EXISTS transfer_details (
  id_detalle UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  id_transferencia UUID NOT NULL REFERENCES transfers(id_transferencia) ON DELETE CASCADE,
  banco_destino VARCHAR(100),
  alias_destino VARCHAR(255),
  cbu_validado BOOLEAN DEFAULT TRUE,
  riesgo_fraude VARCHAR(50),
  -- Values: 'bajo', 'medio', 'alto'
  requiere_verificacion BOOLEAN DEFAULT FALSE,
  fecha_acreditacion_esperada TIMESTAMP,
  numero_operacion_banco VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_id_transferencia (id_transferencia)
);

-- =====================================================================
-- 6. CREATE fraud_logs TABLE - Track fraud risk assessments
-- =====================================================================

CREATE TABLE IF NOT EXISTS fraud_logs (
  id_log UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id UUID NOT NULL REFERENCES user_accounts(usuario_id) ON DELETE CASCADE,
  id_transferencia UUID REFERENCES transfers(id_transferencia) ON DELETE SET NULL,
  tipo_riesgo VARCHAR(50),
  -- Examples: 'cuenta_nueva_monto_alto', 'transferencias_frecuentes', 'historial_mora'
  severity VARCHAR(50),
  -- Values: 'baja', 'media', 'alta'
  descripcion TEXT,
  fue_bloqueado BOOLEAN DEFAULT FALSE,
  fecha_evento TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_usuario_id (usuario_id),
  INDEX idx_id_transferencia (id_transferencia),
  INDEX idx_fecha_evento (fecha_evento)
);

-- =====================================================================
-- 7. CREATE account_lock_history TABLE - Track account blocking events
-- =====================================================================

CREATE TABLE IF NOT EXISTS account_lock_history (
  id_registro UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id UUID NOT NULL REFERENCES user_accounts(usuario_id) ON DELETE CASCADE,
  razon_bloqueo VARCHAR(255),
  intentos_fallidos_acumulados INTEGER,
  fecha_bloqueo TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  fecha_desbloqueo TIMESTAMP,
  fue_manual BOOLEAN DEFAULT FALSE,
  desbloqueado_por VARCHAR(255),
  -- Admin ID or 'sistema' for automatic unlock
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_usuario_id (usuario_id),
  INDEX idx_fecha_bloqueo (fecha_bloqueo)
);

-- =====================================================================
-- 8. CREATE kyc_validation_logs TABLE - Audit trail for KYC decisions
-- =====================================================================

CREATE TABLE IF NOT EXISTS kyc_validation_logs (
  id_log UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id UUID NOT NULL REFERENCES user_accounts(usuario_id) ON DELETE CASCADE,
  estado_anterior VARCHAR(50),
  estado_nuevo VARCHAR(50),
  motivo VARCHAR(255),
  validado_por VARCHAR(255),
  -- Could be admin email or 'sistema' for automatic validation
  documentos_revisados TEXT,
  -- JSON array of document IDs reviewed
  observaciones TEXT,
  fecha_validacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_usuario_id (usuario_id),
  INDEX idx_fecha_validacion (fecha_validacion)
);

-- =====================================================================
-- 9. CREATE external_transfer_logs TABLE - Track external CBU/CVU transfers
-- =====================================================================

CREATE TABLE IF NOT EXISTS external_transfer_logs (
  id_log UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  id_transferencia UUID REFERENCES transfers(id_transferencia) ON DELETE CASCADE,
  usuario_id UUID NOT NULL REFERENCES user_accounts(usuario_id) ON DELETE CASCADE,
  cbu_destino VARCHAR(22) NOT NULL,
  banco_destino VARCHAR(100),
  monto_transferencia DECIMAL(15, 2) NOT NULL,
  estado_transferencia VARCHAR(50),
  -- 'en_proceso', 'acreditada', 'fallida'
  razon_fallo VARCHAR(500),
  validacion_cbu_resultado VARCHAR(50),
  transaccion_numero VARCHAR(100),
  fecha_solicitud TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  fecha_procesamiento TIMESTAMP,
  INDEX idx_usuario_id (usuario_id),
  INDEX idx_id_transferencia (id_transferencia),
  INDEX idx_fecha_solicitud (fecha_solicitud)
);

-- =====================================================================
-- INDEXES FOR PERFORMANCE
-- =====================================================================

-- Improve query performance for common operations
CREATE INDEX IF NOT EXISTS idx_user_accounts_kyc_status
ON user_accounts(kyc_status);

CREATE INDEX IF NOT EXISTS idx_user_accounts_bloqueado
ON user_accounts(bloqueado);

CREATE INDEX IF NOT EXISTS idx_user_accounts_email
ON user_accounts(email);

CREATE INDEX IF NOT EXISTS idx_kyc_documents_estado
ON kyc_documents(estado_validacion, usuario_id);

CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_expiry
ON password_reset_tokens(fecha_vencimiento, utilizado);

CREATE INDEX IF NOT EXISTS idx_transfers_fecha_creacion
ON transfers(fecha_creacion);

-- =====================================================================
-- SAMPLE DATA (OPTIONAL - Remove if not needed)
-- =====================================================================

-- This section is commented out. Uncomment if you want sample data.
/*

-- Add sample transfer limits for KYC-completed users
UPDATE user_accounts
SET limite_transferencia = 50000
WHERE kyc_completo = true;

-- Add sample transfer limits for non-KYC users
UPDATE user_accounts
SET limite_transferencia = 10000
WHERE kyc_completo = false AND limite_transferencia IS NULL;

*/

-- =====================================================================
-- VIEWS FOR COMMON QUERIES (OPTIONAL)
-- =====================================================================

-- View: User KYC Completion Status
CREATE OR REPLACE VIEW v_user_kyc_status AS
SELECT
  ua.usuario_id,
  ua.kyc_completo,
  ua.kyc_status,
  ua.fecha_registro,
  COUNT(kd.id_documento) as documentos_cargados,
  MAX(CASE WHEN kd.tipo_documento = 'dni' THEN 1 ELSE 0 END) as tiene_dni,
  MAX(CASE WHEN kd.tipo_documento = 'selfie' THEN 1 ELSE 0 END) as tiene_selfie,
  MAX(kd.fecha_carga) as ultima_carga_documento
FROM user_accounts ua
LEFT JOIN kyc_documents kd ON ua.usuario_id = kd.usuario_id
GROUP BY ua.usuario_id, ua.kyc_completo, ua.kyc_status, ua.fecha_registro;

-- View: User Account Security Status
CREATE OR REPLACE VIEW v_user_security_status AS
SELECT
  usuario_id,
  bloqueado,
  intentos_fallidos,
  fecha_proximo_intento,
  CASE
    WHEN bloqueado = true AND fecha_proximo_intento > CURRENT_TIMESTAMP
    THEN 'temp_bloqueado'
    WHEN bloqueado = true
    THEN 'bloqueado_permanente'
    ELSE 'activo'
  END as estado_seguridad,
  CASE
    WHEN bloqueado = true AND fecha_proximo_intento > CURRENT_TIMESTAMP
    THEN EXTRACT(EPOCH FROM (fecha_proximo_intento - CURRENT_TIMESTAMP)) / 60
    ELSE NULL
  END as minutos_hasta_desbloqueo
FROM user_accounts;

-- =====================================================================
-- NOTES
-- =====================================================================
--
-- 1. Password Hashing:
--    - Passwords are hashed using PBKDF2 with SHA-512
--    - Format stored: "salt.hash" (64-char hex salt + 128-char hex hash)
--    - NEVER store plain text passwords
--
-- 2. KYC Workflow:
--    - User uploads DNI and selfie photos
--    - System validates documents (may be automatic or manual)
--    - KYC status changes: pendiente -> en_revision -> aprobado/rechazado
--    - Transfer limits increase from 10,000 to 50,000 upon approval
--
-- 3. Account Locking:
--    - After 5 failed login attempts, account is temporarily locked
--    - Automatic unlock after 1 hour
--    - Manual unlock available to admins
--
-- 4. Password Reset:
--    - Token expires in 24 hours
--    - Token can only be used once
--    - User must provide new password (minimum 8 characters)
--
-- 5. External Transfers:
--    - CBU: 22 digits (Argentine standard)
--    - CVU: 10 digits (Virtual account)
--    - All transfers go through fraud checks
--    - Logging helps with compliance and dispute resolution
--
-- =====================================================================
