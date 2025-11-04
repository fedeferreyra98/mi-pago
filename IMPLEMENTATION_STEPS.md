# Implementation Steps for Mi Pago User Stories (HU-CR-06 to HU-CR-13)

## Overview
This document details the implementation steps for 8 user stories covering transfer receipts, fraud prevention, authentication, KYC, and security features. The implementation follows the existing Clean Architecture pattern with Service-Repository-Handler layers.

---

## Table of Contents
1. [HU-CR-06: Transfer Receipt & Detail](#hu-cr-06-transfer-receipt--detail)
2. [HU-CR-07: Daily/Monthly Limits & Fraud Prevention](#hu-cr-07-dailymonthly-limits--fraud-prevention)
3. [HU-CR-08: Transfer to External CBU/CVU](#hu-cr-08-transfer-to-external-cbucvu)
4. [HU-CR-09: KYC Data Upload](#hu-cr-09-kyc-data-upload)
5. [HU-CR-10: User Registration (Email/Password)](#hu-cr-10-user-registration-emailpassword)
6. [HU-CR-11: User Login (Email/Password)](#hu-cr-11-user-login-emailpassword)
7. [HU-CR-12: Password Recovery](#hu-cr-12-password-recovery)
8. [HU-CR-13: Login Attempt Blocking](#hu-cr-13-login-attempt-blocking)

---

## HU-CR-06: Transfer Receipt & Detail

### Acceptance Criteria
- View transfer receipt with: date/time, amount, recipient (alias/CBU), reference, status
- Share/download receipt as PDF

### Implementation Steps

#### 1. Update Database Schema
**File:** Create migration for new tables
```sql
-- transfers table
CREATE TABLE transfers (
  id_transferencia UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id_origen UUID NOT NULL REFERENCES user_accounts(usuario_id),
  usuario_id_destino UUID REFERENCES user_accounts(usuario_id), -- NULL for external
  cbu_destino VARCHAR(22) REFERENCES cuentas_externas(cbu), -- NULL for internal
  monto DECIMAL(12,2) NOT NULL,
  referencia VARCHAR(255),
  estado VARCHAR(50) NOT NULL, -- 'pendiente', 'en_proceso', 'acreditada', 'fallida'
  comprobante_json JSONB, -- Store receipt details
  fecha_creacion TIMESTAMP DEFAULT NOW(),
  fecha_acreditacion TIMESTAMP,
  fecha_actualizacion TIMESTAMP DEFAULT NOW()
);

-- comprobantes table (receipts)
CREATE TABLE comprobantes (
  id_comprobante UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  id_transferencia UUID NOT NULL REFERENCES transfers(id_transferencia),
  numero_comprobante VARCHAR(50) UNIQUE NOT NULL,
  fecha_hora TIMESTAMP NOT NULL,
  pdf_url VARCHAR(500),
  estado_descarga VARCHAR(50), -- 'generado', 'disponible', 'expirado'
  fecha_expiracion TIMESTAMP,
  fecha_creacion TIMESTAMP DEFAULT NOW()
);
```

#### 2. Update Type Definitions
**File:** `src/types/index.ts`

Add interfaces:
```typescript
enum TransferStatus {
  PENDIENTE = 'pendiente',
  EN_PROCESO = 'en_proceso',
  ACREDITADA = 'acreditada',
  FALLIDA = 'fallida'
}

interface Transfer {
  id_transferencia: string;
  usuario_id_origen: string;
  usuario_id_destino?: string;
  cbu_destino?: string;
  monto: number;
  referencia?: string;
  estado: TransferStatus;
  comprobante_json?: object;
  fecha_creacion: Date;
  fecha_acreditacion?: Date;
}

interface Comprobante {
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
}

interface ComprobanteDetail {
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
```

#### 3. Create TransfersRepository
**File:** `src/repositories/TransfersRepository.ts`

Methods:
- `createTransfer(data)`: Insert transfer record
- `getTransferById(id)`: Retrieve transfer with details
- `getTransfersForUser(userId)`: List user's transfers with pagination
- `updateTransferStatus(transferId, status)`: Update status
- `createComprobante(transferId, comprobanteData)`: Generate receipt record
- `getComprobanteByTransferId(transferId)`: Get receipt
- `updateComprobanteUrl(comprobanteId, pdfUrl)`: Store PDF URL

#### 4. Create TransfersService
**File:** `src/services/TransfersService.ts`

Methods:
- `getTransferDetail(transferId, usuarioId)`: Retrieve with validation
- `generateComprobante(transfer)`: Create receipt object with formatted data
- `generateComprobanteNumber()`: Generate sequential number (COMP-YYYYMMDD-XXXXX)
- `createPdfReceipt(comprobanteDetail)`: Generate PDF file
  - Use `pdfkit` or similar library
  - Include header, transfer details, QR code with transfer ID
- `uploadPdfToStorage(pdf, comprobanteId)`: Upload to cloud storage (Supabase or S3)
- `shareComprobante(transferId, usuarioId)`: Return shareable link
- `getDownloadLink(transferId, usuarioId)`: Generate temporary download URL (24h expiry)

#### 5. Create TransfersHandler
**File:** `src/handlers/TransfersHandler.ts`

Endpoints:
- `GET /api/transfers/:id_transferencia` - Get transfer detail
- `GET /api/transfers/:id_transferencia/comprobante` - Get receipt
- `POST /api/transfers/:id_transferencia/comprobante/download` - Generate download
- `POST /api/transfers/:id_transferencia/comprobante/share` - Get shareable link

#### 6. Update Routes
**File:** `src/routes/index.ts`

Add routes and bind handlers:
```typescript
router.get('/transfers/:id_transferencia', verifyToken,
  (req, res) => transferHandler.getTransferDetail(req, res));
router.get('/transfers/:id_transferencia/comprobante', verifyToken,
  (req, res) => transferHandler.getComprobanteDetail(req, res));
router.post('/transfers/:id_transferencia/comprobante/download', verifyToken,
  (req, res) => transferHandler.generatePdfDownload(req, res));
router.post('/transfers/:id_transferencia/comprobante/share', verifyToken,
  (req, res) => transferHandler.getShareableLink(req, res));
```

#### 7. Update Existing TransferHandler
**File:** `src/handlers/TransferHandler.ts` (existing)

Modify `executeTransfer()` to:
1. After successful transfer → call `transfersService.generateComprobante()`
2. Call `createPdfReceipt()` and `uploadPdfToStorage()`
3. Save comprobante record with PDF URL
4. Return transfer object with comprobante link in response

#### 8. Add PDF Generation Dependency
**File:** `package.json`

Add library:
```json
{
  "pdfkit": "^0.13.0",
  "qrcode": "^1.5.3"
}
```

---

## HU-CR-07: Daily/Monthly Limits & Fraud Prevention

### Acceptance Criteria
- Reject transfers exceeding daily/monthly limits
- Apply fraud checks (velocity, new device)
- Block operation and suggest KYC/account age improvement

### Implementation Steps

#### 1. Update Database Schema
```sql
-- transfer_limits table (configuration per profile)
CREATE TABLE transfer_limits (
  id_limite UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  perfil VARCHAR(50) NOT NULL, -- 'basico', 'normal', 'premium'
  limite_diario DECIMAL(12,2) NOT NULL,
  limite_mensual DECIMAL(12,2) NOT NULL,
  limite_por_transferencencia DECIMAL(12,2) NOT NULL,
  intentos_fraude_permitidos INT DEFAULT 3,
  dias_minimos_cuenta INT DEFAULT 0,
  requiere_kyc BOOLEAN DEFAULT true,
  fecha_creacion TIMESTAMP DEFAULT NOW()
);

-- fraud_checks table
CREATE TABLE fraud_checks (
  id_check UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  id_transferencia UUID REFERENCES transfers(id_transferencia),
  usuario_id UUID NOT NULL REFERENCES user_accounts(usuario_id),
  tipo_alerta VARCHAR(100), -- 'velocidad_alta', 'dispositivo_nuevo', 'ubicacion_inusual'
  puntuacion_riesgo INT, -- 0-100
  verificacion_requerida BOOLEAN DEFAULT true,
  resultado_verificacion VARCHAR(50), -- 'aprobado', 'bloqueado', 'pendiente'
  fecha_creacion TIMESTAMP DEFAULT NOW()
);

-- user_devices table (track device fingerprints)
CREATE TABLE user_devices (
  id_device UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id UUID NOT NULL REFERENCES user_accounts(usuario_id),
  device_fingerprint VARCHAR(255) NOT NULL,
  nombre_dispositivo VARCHAR(100),
  primera_vez TIMESTAMP NOT NULL,
  ultima_actividad TIMESTAMP DEFAULT NOW(),
  es_conocido BOOLEAN DEFAULT false,
  UNIQUE(usuario_id, device_fingerprint)
);

-- daily_transfer_logs table (for tracking transfer velocity)
CREATE TABLE daily_transfer_logs (
  id_log UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id UUID NOT NULL REFERENCES user_accounts(usuario_id),
  monto_total_diario DECIMAL(12,2),
  numero_transacciones INT,
  fecha DATE NOT NULL,
  UNIQUE(usuario_id, fecha)
);
```

#### 2. Update Type Definitions
**File:** `src/types/index.ts`

```typescript
enum UserProfile {
  BASICO = 'basico',
  NORMAL = 'normal',
  PREMIUM = 'premium'
}

enum FraudAlertType {
  VELOCIDAD_ALTA = 'velocidad_alta',
  DISPOSITIVO_NUEVO = 'dispositivo_nuevo',
  UBICACION_INUSUAL = 'ubicacion_inusual'
}

interface TransferLimit {
  id_limite: string;
  perfil: UserProfile;
  limite_diario: number;
  limite_mensual: number;
  limite_por_transferencencia: number;
  intentos_fraude_permitidos: number;
  dias_minimos_cuenta: number;
  requiere_kyc: boolean;
}

interface FraudCheck {
  id_check: string;
  id_transferencia?: string;
  usuario_id: string;
  tipo_alerta: FraudAlertType;
  puntuacion_riesgo: number; // 0-100
  verificacion_requerida: boolean;
  resultado_verificacion: 'aprobado' | 'bloqueado' | 'pendiente';
}

interface TransferLimitCheckResult {
  permitido: boolean;
  razon?: string;
  limite_actual: number;
  usado_hoy: number;
  disponible: number;
  como_ampliar?: string;
}

interface FraudCheckResult {
  riesgo_detectado: boolean;
  alertas: FraudCheck[];
  puntuacion_riesgo_total: number;
  accion_requerida: 'aprobado' | 'verificacion_requerida' | 'bloqueado';
  mensaje: string;
}
```

#### 3. Create LimitsRepository
**File:** `src/repositories/LimitsRepository.ts`

Methods:
- `getLimitsByProfile(profile)`: Get limits configuration
- `getDailyTransferTotal(userId, date)`: Sum transfers for day
- `getMonthlyTransferTotal(userId, year, month)`: Sum transfers for month
- `logTransfer(userId, monto, fecha)`: Record transfer for tracking
- `updateDailyLog(userId, date, monto, transactionCount)`: Update daily aggregate

#### 4. Create FraudCheckRepository
**File:** `src/repositories/FraudCheckRepository.ts`

Methods:
- `recordDeviceFingerprint(userId, deviceFingerprint, nombre)`: Register device
- `isKnownDevice(userId, deviceFingerprint)`: Check if device previously used
- `recordFraudCheck(check)`: Save fraud alert
- `getFraudChecksByTransferId(transferId)`: Get checks for transfer
- `getTransferVelocity(userId, hoursBack)`: Count transfers in time window
- `checkRecentLocationChange(userId)`: Detect location anomalies

#### 5. Create FraudCheckService
**File:** `src/services/FraudCheckService.ts`

Methods:
- `checkTransferLimits(userId, monto, tipoTransferencia)`: Validate against limits
  - Get user's profile based on KYC status and account age
  - Check daily limit
  - Check monthly limit
  - Check per-transaction limit
  - Return `TransferLimitCheckResult`

- `performFraudChecks(userId, transfer, deviceFingerprint)`: Run fraud detection
  1. Check transfer velocity (5+ transfers in 1 hour = HIGH RISK)
  2. Check for new device (unknown fingerprint = MEDIUM RISK)
  3. Check location change (if IP available = MEDIUM RISK)
  4. Calculate cumulative risk score
  5. Determine action (approved/verification_required/blocked)
  6. Record checks in database

- `getTransferLimitByProfile(userId)`: Determine and fetch limits
  - If KYC incomplete & account < 30 days → BASICO profile
  - If KYC complete & account > 30 days → NORMAL profile
  - If KYC + high score + time → PREMIUM profile

- `generateLimitMessage(checkResult)`: Format message for user
  - Include: current limit, amount used today, amount available
  - Include: how to increase (complete KYC, wait X days)

- `calculateRiskScore(fraudChecks)`: Aggregate scores from multiple checks

#### 6. Update TransferService
**File:** `src/services/TransfersService.ts` (existing)

Modify `executeTransfer()` to:
1. Before execution, call `fraudCheckService.checkTransferLimits()`
2. If limit exceeded, throw `TransferLimitExceededError` with helpful message
3. Call `fraudCheckService.performFraudChecks()`
4. If risk = VERIFICATION_REQUIRED, return response with verification challenge
5. If risk = BLOCKED, throw `FraudDetectedError`
6. If approved, proceed with transfer and log in daily_transfer_logs

#### 7. Create/Update Handler
**File:** `src/handlers/TransferHandler.ts` (existing)

Update `executeTransfer()` endpoint response:
```typescript
{
  exito: false,
  code: 'LIMITE_EXCEDIDO',
  error: 'Excediste tu límite diario de $X. Completá tu KYC para ampliarlo.',
  data: {
    limite_actual: 10000,
    usado_hoy: 8000,
    disponible: 2000,
    como_ampliar: 'kyc'
  }
}
```

#### 8. Add New Endpoints
**File:** `src/routes/index.ts`

```typescript
router.get('/transfers/limits/:usuario_id', verifyToken,
  (req, res) => transferHandler.getTransferLimits(req, res));
router.post('/transfers/check-limits', verifyToken,
  (req, res) => transferHandler.checkLimitsPreview(req, res));
router.post('/transfers/fraud-check', verifyToken,
  (req, res) => transferHandler.performFraudCheck(req, res));
```

---

## HU-CR-08: Transfer to External CBU/CVU

### Acceptance Criteria
- Transfer to valid external CBU/CVU
- Confirm with PIN/biometry
- Show status: pending → processing → credited/failed
- Notify on completion
- Reject invalid CBU/CVU

### Implementation Steps

#### 1. Update Database Schema
```sql
-- external_accounts table (manage external beneficiaries)
CREATE TABLE external_accounts (
  id_cuenta_externa UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id UUID NOT NULL REFERENCES user_accounts(usuario_id),
  cbu VARCHAR(22) NOT NULL,
  alias_cvu VARCHAR(100),
  banco_nombre VARCHAR(100),
  titular_nombre VARCHAR(255) NOT NULL,
  es_verificado BOOLEAN DEFAULT false,
  fecha_verificacion TIMESTAMP,
  fecha_creacion TIMESTAMP DEFAULT NOW(),
  UNIQUE(usuario_id, cbu)
);

-- external_transfer_logs table (for retry tracking)
CREATE TABLE external_transfer_logs (
  id_log UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  id_transferencia UUID NOT NULL REFERENCES transfers(id_transferencia),
  intento_numero INT,
  codigo_error_banco VARCHAR(100),
  mensaje_error TEXT,
  fecha_intento TIMESTAMP DEFAULT NOW(),
  proximo_reintento TIMESTAMP
);
```

#### 2. Update Transfer Type Definitions
**File:** `src/types/index.ts`

```typescript
enum TransferType {
  INTERNA = 'interna', // Mi Pago to Mi Pago
  EXTERNA = 'externa'  // Mi Pago to external bank
}

interface ExternalAccount {
  id_cuenta_externa: string;
  usuario_id: string;
  cbu: string;
  alias_cvu?: string;
  banco_nombre: string;
  titular_nombre: string;
  es_verificado: boolean;
  fecha_verificacion?: Date;
}

interface CbuValidationResult {
  valido: boolean;
  banco?: string;
  titular?: string;
  error?: string;
}

interface ExternalTransferRequest {
  cbu_destino: string;
  alias_cvu?: string;
  monto: number;
  referencia?: string;
  verificador: 'pin' | 'biometria';
  pin?: string;
  biometria_token?: string;
}
```

#### 3. Create BankCbuValidator Service
**File:** `src/services/BankCbuValidator.ts` (new file)

Methods:
- `validateCbu(cbu)`: Validate CBU format and check BCRA registry
  - Check format: 22 digits, valid length
  - Call mock BCRA API or validation service
  - Return `CbuValidationResult`

- `validateCvu(cvu)`: Similar for CVU format (16 chars)

- `getBankInfo(cbu)`: Extract bank code and return bank name

- `parseAndValidateRecipient(cbuOrAlias)`: Handle both CBU and alias

#### 4. Create ExternalAccountsRepository
**File:** `src/repositories/ExternalAccountsRepository.ts`

Methods:
- `addExternalAccount(userId, externalAccount)`: Save beneficiary
- `getExternalAccountsByCbu(userId, cbu)`: Retrieve specific account
- `getExternalAccountsByUser(userId)`: List all beneficiaries
- `verifyExternalAccount(externalAccountId, verificationMethod)`: Mark as verified
- `deleteExternalAccount(externalAccountId)`: Remove beneficiary
- `logExternalTransferAttempt(transferId, attemptNumber, error)`: Track retries

#### 5. Update TransfersService
**File:** `src/services/TransfersService.ts` (existing)

Add method:
- `executeExternalTransfer(userId, externalTransferRequest)`:
  1. Validate CBU/CVU using `BankCbuValidator`
  2. If invalid, return error: "CBU/CVU inválido o inactivo"
  3. Verify user funds availability
  4. Verify PIN/biometry with `authService.verifyPin()` or biometry check
  5. Create transfer record with status = 'en_proceso'
  6. Call `BankingAPI.transferToExternalAccount()`
  7. Update transfer status based on response
  8. Return confirmation with reference number
  9. Queue notification

- `retryExternalTransfer(transferId)`: Automatic retry logic (24h window, 3 attempts max)

#### 6. Create PIN/Biometry Verification
**File:** `src/services/BiometryService.ts` (if new)

Methods:
- `verifyPin(userId, pin)`: Compare with stored hash
- `verifyBiometryToken(userId, token)`: Validate biometric token from client
- `generateBiometryToken()`: Create temporary token

**Note:** PIN should be stored as salted hash, biometry handled by client SDK

#### 7. Update TransferHandler
**File:** `src/handlers/TransferHandler.ts` (existing)

Add endpoint:
```typescript
POST /api/transfers/external/execute
Body: {
  cbu_destino: "1234567890123456789012",
  alias_cvu?: "alias@banco",
  monto: 5000,
  referencia?: "pago servicios",
  verificador: "pin", // or "biometria"
  pin?: "1234"
}

Response (success):
{
  exito: true,
  data: {
    id_transferencia: "uuid",
    estado: "en_proceso",
    numero_comprobante: "EXT-20250101-00001",
    fecha_creacion: "2025-01-01T10:30:00Z",
    monto: 5000,
    cbu_destino: "1234567890123456789012",
    mensaje: "Transferencia iniciada. Recibirás confirmación en tu email"
  }
}

Response (invalid CBU):
{
  exito: false,
  code: 'CBU_INVALIDO',
  error: "CBU/CVU inválido o inactivo"
}
```

#### 8. Add Routes
**File:** `src/routes/index.ts`

```typescript
router.post('/transfers/external/execute', verifyToken,
  (req, res) => transferHandler.executeExternalTransfer(req, res));
router.post('/transfers/external/validate-cbu', verifyToken,
  (req, res) => transferHandler.validateCbu(req, res));
router.post('/transfers/external/add-beneficiary', verifyToken,
  (req, res) => transferHandler.addExternalBeneficiary(req, res));
router.get('/transfers/external/beneficiaries', verifyToken,
  (req, res) => transferHandler.listBeneficiaries(req, res));
```

#### 9. Add Notification Queue
Update `BankingAPI` to emit events for:
- Transfer pending notification
- Transfer completed notification (success/failure)
- Use queue system (bull, kafka, or simple email service)

---

## HU-CR-09: KYC Data Upload

### Acceptance Criteria
- Upload DNI front/back + selfie
- System validates consistency
- Status: KYC_aprobado or KYC_rechazado with reason
- Upon approval: show increased limits and credit access

### Implementation Steps

#### 1. Update Database Schema
```sql
-- kyc_documents table
CREATE TABLE kyc_documents (
  id_documento UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id UUID NOT NULL REFERENCES user_accounts(usuario_id),
  tipo_documento VARCHAR(50) NOT NULL, -- 'dni_frente', 'dni_dorso', 'selfie'
  url_documento VARCHAR(500) NOT NULL,
  metadata JSONB, -- file size, format, upload timestamp
  fecha_carga TIMESTAMP DEFAULT NOW(),
  UNIQUE(usuario_id, tipo_documento)
);

-- kyc_validation_result table
CREATE TABLE kyc_validation_result (
  id_validacion UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id UUID NOT NULL REFERENCES user_accounts(usuario_id),
  estado VARCHAR(50) NOT NULL, -- 'pendiente', 'aprobado', 'rechazado'
  razon_rechazo VARCHAR(500),
  puntuacion_confianza DECIMAL(3,2), -- 0.00-1.00
  documentos_analizados TEXT[], -- array of document types
  fecha_validacion TIMESTAMP,
  fecha_actualizacion TIMESTAMP DEFAULT NOW()
);
```

#### 2. Update Type Definitions
**File:** `src/types/index.ts`

```typescript
enum KycStatus {
  PENDIENTE = 'pendiente',
  APROBADO = 'kyc_aprobado',
  RECHAZADO = 'kyc_rechazado'
}

enum DocumentType {
  DNI_FRENTE = 'dni_frente',
  DNI_DORSO = 'dni_dorso',
  SELFIE = 'selfie'
}

interface KycDocument {
  id_documento: string;
  usuario_id: string;
  tipo_documento: DocumentType;
  url_documento: string;
  metadata: {
    file_size: number;
    file_type: string;
    upload_timestamp: Date;
  };
  fecha_carga: Date;
}

interface KycValidationRequest {
  documentos: {
    dni_frente: File;
    dni_dorso: File;
    selfie: File;
  };
}

interface KycValidationResult {
  id_validacion: string;
  usuario_id: string;
  estado: KycStatus;
  razon_rechazo?: string;
  puntuacion_confianza: number;
  documentos_analizados: DocumentType[];
  fecha_validacion: Date;
}
```

#### 3. Create KycDocumentsRepository
**File:** `src/repositories/KycDocumentsRepository.ts`

Methods:
- `uploadDocument(userId, documentType, fileBuffer, metadata)`: Save document
- `getDocumentByType(userId, documentType)`: Retrieve specific document
- `getAllDocuments(userId)`: Get all uploaded documents
- `deleteDocument(documentId)`: Remove uploaded document
- `saveValidationResult(validationResult)`: Store validation outcome
- `getLatestValidation(userId)`: Retrieve most recent validation

#### 4. Create KycService
**File:** `src/services/KycService.ts`

Methods:
- `uploadDocuments(userId, documents)`: Handle multi-file upload
  1. Validate file types (image only: JPG, PNG)
  2. Validate file sizes (max 5MB each)
  3. Upload to cloud storage (Supabase)
  4. Save metadata to DB
  5. Return success with document URLs

- `validateKycDocuments(userId)`: Run validation workflow
  1. Retrieve all 3 documents (DNI front, back, selfie)
  2. Call external OCR service (AWS Rekognition, Google Vision, etc.)
  3. Extract DNI number and face data
  4. Compare face from DNI and selfie (face matching)
  5. Validate DNI number format
  6. Check DNI against document validity DB
  7. Calculate confidence score
  8. Save validation result
  9. Update user_accounts.kyc_completo
  10. If approved, update limits in database

- `getKycStatus(userId)`: Return current status and next steps

- `validateDocumentFormat(file)`: Pre-upload validation
  - Check MIME type
  - Check dimensions (min 1920x1080 recommended)
  - Check file size

#### 5. Create KycHandler
**File:** `src/handlers/KycHandler.ts`

Endpoints:
```typescript
POST /api/kyc/upload
Body: FormData with files (dni_frente, dni_dorso, selfie)

Response (success):
{
  exito: true,
  data: {
    documentos_cargados: ['dni_frente', 'dni_dorso', 'selfie'],
    estado_validacion: 'pendiente',
    mensaje: 'Documentos cargados. Validación en progreso...'
  }
}

GET /api/kyc/status

Response:
{
  exito: true,
  data: {
    estado: 'kyc_aprobado', // or 'pendiente', 'kyc_rechazado'
    razon_rechazo?: null,
    puntuacion_confianza: 0.95,
    fecha_validacion: "2025-01-01T10:30:00Z",
    limites_ampliados: {
      limite_diario_anterior: 10000,
      limite_diario_nuevo: 50000,
      limite_mensual_anterior: 30000,
      limite_mensual_nuevo: 200000
    }
  }
}

POST /api/kyc/validate (internal endpoint for async job)
```

#### 6. Create Async Validation Job
**File:** `src/services/KycValidationJob.ts`

- Use job queue (Bull + Redis, or simpler: Node schedule)
- Poll for KYC documents uploaded
- Call validation after all 3 docs present
- Update user limits upon approval
- Send notification email

#### 7. Add Routes
**File:** `src/routes/index.ts`

```typescript
router.post('/kyc/upload', verifyToken,
  (req, res) => kycHandler.uploadDocuments(req, res));
router.get('/kyc/status', verifyToken,
  (req, res) => kycHandler.getKycStatus(req, res));
router.post('/kyc/validate', verifyToken, // Optional: trigger manual validation
  (req, res) => kycHandler.triggerValidation(req, res));
```

#### 8. Integration with Limits
Update `FraudCheckService.getTransferLimitByProfile()` to:
- Check `kyc_completo` status
- If approved recently, user gets NORMAL profile (higher limits)

---

## HU-CR-10: User Registration (Email/Password)

### Acceptance Criteria
- Register with: email, password, DNI, full name
- Create account on confirmation
- Error if email already exists

### Implementation Steps

#### 1. Update Database Schema
```sql
-- users table (authentication - new, separate from user_accounts)
CREATE TABLE users (
  usuario_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  salt VARCHAR(32) NOT NULL,
  nombre_completo VARCHAR(255) NOT NULL,
  numero_dni VARCHAR(20) NOT NULL UNIQUE,
  estado_cuenta VARCHAR(50) NOT NULL DEFAULT 'activa', -- 'activa', 'bloqueada', 'suspendida'
  verificacion_email_estado VARCHAR(50) DEFAULT 'pendiente', -- 'pendiente', 'verificado'
  token_verificacion_email VARCHAR(255),
  fecha_vencimiento_token_email TIMESTAMP,
  fecha_registro TIMESTAMP DEFAULT NOW(),
  fecha_ultimo_login TIMESTAMP,
  fecha_actualizacion TIMESTAMP DEFAULT NOW()
);

-- Update user_accounts to reference users instead of self-referencing
ALTER TABLE user_accounts DROP CONSTRAINT user_accounts_pkey;
ALTER TABLE user_accounts ADD CONSTRAINT user_accounts_fk
  FOREIGN KEY (usuario_id) REFERENCES users(usuario_id);
```

#### 2. Update Type Definitions
**File:** `src/types/index.ts`

```typescript
interface RegistrationRequest {
  email: string;
  password: string;
  nombre_completo: string;
  numero_dni: string;
}

interface User {
  usuario_id: string;
  email: string;
  nombre_completo: string;
  numero_dni: string;
  estado_cuenta: 'activa' | 'bloqueada' | 'suspendida';
  verificacion_email_estado: 'pendiente' | 'verificado';
  fecha_registro: Date;
  fecha_ultimo_login?: Date;
}

interface RegistrationResponse {
  usuario_id: string;
  email: string;
  token: string; // JWT
  mensaje: string;
}
```

#### 3. Create UsersRepository
**File:** `src/repositories/UsersRepository.ts`

Methods:
- `createUser(userData)`: Insert user with hashed password
  - Hash password using bcrypt
  - Generate salt
  - Store hashed password and salt

- `getUserByEmail(email)`: Find user by email
- `getUserById(userId)`: Find user by ID
- `checkEmailExists(email)`: Boolean check
- `checkDniExists(dni)`: Boolean check
- `updateLastLogin(userId)`: Set last login timestamp
- `updateVerificationToken(userId, token, expiresAt)`: Store verification token
- `markEmailAsVerified(userId)`: Update verification status

#### 4. Create PasswordService
**File:** `src/services/PasswordService.ts`

Methods:
- `hashPassword(password)`: Use bcrypt with salt rounds = 10
- `verifyPassword(password, hash)`: Compare passwords
- `generateResetToken()`: Create secure token (32 bytes, hex)
- `generateVerificationToken()`: Create verification token

#### 5. Create RegistrationService
**File:** `src/services/RegistrationService.ts`

Methods:
- `registerUser(registrationRequest)`: Main registration flow
  1. Validate email format (RFC 5322)
  2. Validate password strength (min 8 chars, uppercase, number, special char)
  3. Validate DNI format (11 digits for Argentina)
  4. Check email doesn't exist → error: "Este email ya está registrado"
  5. Check DNI doesn't exist
  6. Hash password
  7. Create user record
  8. Create user_account record (linked)
  9. Generate verification token
  10. Send verification email
  11. Generate JWT token
  12. Return user data + token

- `validatePasswordStrength(password)`: Return validation errors
  - Min 8 characters
  - At least 1 uppercase letter
  - At least 1 number
  - At least 1 special character (!@#$%^&*)

- `validateEmail(email)`: Format validation

- `validateDni(dni)`: Format validation for Argentina

#### 6. Create RegistrationHandler
**File:** `src/handlers/RegistrationHandler.ts`

Endpoint:
```typescript
POST /api/auth/register
Body: {
  email: "user@example.com",
  password: "SecurePass123!",
  nombre_completo: "Juan Pérez",
  numero_dni: "12345678901"
}

Response (success):
{
  exito: true,
  data: {
    usuario_id: "uuid",
    email: "user@example.com",
    token: "eyJhbGciOiJIUzI1NiIs...",
    mensaje: "Cuenta creada. Verifica tu email para continuar."
  }
}

Response (email exists):
{
  exito: false,
  code: 'EMAIL_EXISTE',
  error: "Este email ya está registrado. Iniciá sesión o recuperá tu contraseña."
}

Response (validation error):
{
  exito: false,
  code: 'VALIDACION_FALLIDA',
  error: "La contraseña debe tener al menos 8 caracteres",
  campos_invalidos: {
    password: ["minimo 8 caracteres", "requiere número"]
  }
}
```

#### 7. Add Email Verification
**File:** `src/services/EmailService.ts` (if new)

Methods:
- `sendVerificationEmail(email, verificationToken)`: Send verification link
  - Include 24-hour expiry
  - Include verification URL with token

#### 8. Create Email Verification Endpoint
```typescript
GET /api/auth/verify-email?token=xxx

Response (success):
{
  exito: true,
  data: {
    mensaje: "Email verificado correctamente"
  }
}

Response (expired):
{
  exito: false,
  code: 'TOKEN_VENCIDO',
  error: "Token de verificación vencido"
}
```

#### 9. Add Routes
**File:** `src/routes/index.ts`

```typescript
router.post('/auth/register',
  (req, res) => registrationHandler.registerUser(req, res));
router.get('/auth/verify-email',
  (req, res) => registrationHandler.verifyEmail(req, res));
router.post('/auth/resend-verification',
  (req, res) => registrationHandler.resendVerificationEmail(req, res));
```

#### 10. Update Type Definitions
**File:** `src/types/index.ts`

Update `JWTPayload`:
```typescript
interface JWTPayload {
  usuario_id: string;
  email: string;
  iat?: number;
  exp?: number;
}
```

---

## HU-CR-11: User Login (Email/Password)

### Acceptance Criteria
- Login with email + password
- Access dashboard on success showing balance
- Error message on invalid credentials (without exposing which field failed)
- Prevent brute force (see HU-CR-13)

### Implementation Steps

#### 1. Create LoginService
**File:** `src/services/LoginService.ts`

Methods:
- `authenticateUser(email, password)`: Main login flow
  1. Find user by email
  2. If not found → return generic error
  3. Check password using `PasswordService.verifyPassword()`
  4. If incorrect → increment login attempts (for HU-CR-13)
  5. If correct → reset login attempts, update last_login
  6. Generate JWT token
  7. Return user data + token

#### 2. Create LoginHandler
**File:** `src/handlers/LoginHandler.ts`

Endpoint:
```typescript
POST /api/auth/login
Body: {
  email: "user@example.com",
  password: "SecurePass123!"
}

Response (success):
{
  exito: true,
  data: {
    usuario_id: "uuid",
    email: "user@example.com",
    nombre_completo: "Juan Pérez",
    token: "eyJhbGciOiJIUzI1NiIs...",
    saldo: 5000,
    kyc_completo: true,
    limites: {
      limite_diario: 50000,
      limite_mensual: 200000
    }
  }
}

Response (invalid):
{
  exito: false,
  code: 'CREDENCIALES_INVALIDAS',
  error: "Usuario o contraseña incorrectos"
}

Response (account locked):
{
  exito: false,
  code: 'CUENTA_BLOQUEADA',
  error: "Tu cuenta está bloqueada. Intenta en 15 minutos o recupera tu contraseña."
}
```

#### 3. Update Middleware
**File:** `src/middleware/authMiddleware.ts`

Enhance `verifyToken()` to:
- Extract user data from token
- Return user object with email, kyc status, etc.

#### 4. Add Routes
**File:** `src/routes/index.ts`

```typescript
router.post('/auth/login',
  (req, res) => loginHandler.authenticateUser(req, res));
```

#### 5. Add Session Management (Optional)
- Create `SessionRepository` if session-based auth needed
- Otherwise, pure stateless JWT is sufficient

#### 6. Add /me Endpoint
```typescript
GET /api/auth/me
Headers: { Authorization: "Bearer {token}" }

Response:
{
  exito: true,
  data: {
    usuario_id: "uuid",
    email: "user@example.com",
    nombre_completo: "Juan Pérez",
    saldo: 5000,
    kyc_completo: true,
    cuenta_activa: true,
    limites: { ... }
  }
}
```

---

## HU-CR-12: Password Recovery

### Acceptance Criteria
- Request password reset via email
- Receive reset link with limited validity
- Expired links show error message
- Can request new link

### Implementation Steps

#### 1. Update Database Schema
```sql
-- password_reset_tokens table
CREATE TABLE password_reset_tokens (
  id_token UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id UUID NOT NULL REFERENCES users(usuario_id),
  token VARCHAR(255) UNIQUE NOT NULL,
  fecha_vencimiento TIMESTAMP NOT NULL,
  utilizado BOOLEAN DEFAULT false,
  fecha_utilizacion TIMESTAMP,
  fecha_creacion TIMESTAMP DEFAULT NOW()
);
```

#### 2. Update Type Definitions
**File:** `src/types/index.ts`

```typescript
interface PasswordResetRequest {
  email: string;
}

interface PasswordResetToken {
  id_token: string;
  usuario_id: string;
  token: string;
  fecha_vencimiento: Date;
  utilizado: boolean;
}

interface PasswordResetConfirm {
  token: string;
  nueva_contrasena: string;
}
```

#### 3. Create PasswordResetRepository
**File:** `src/repositories/PasswordResetRepository.ts`

Methods:
- `createResetToken(userId)`: Generate token valid for 1 hour
  - Generate secure token (32 bytes)
  - Set expiry to 60 minutes from now
  - Store in DB
  - Return token

- `getResetToken(token)`: Retrieve token record
- `validateResetToken(token)`: Check if valid (not expired, not used)
- `markTokenAsUsed(tokenId)`: Set utilizado = true, fecha_utilizacion
- `deleteExpiredTokens(userId)`: Clean up old tokens

#### 4. Create PasswordResetService
**File:** `src/services/PasswordResetService.ts`

Methods:
- `requestPasswordReset(email)`: Initiate reset
  1. Find user by email
  2. If not found → return success (security: don't reveal if email exists)
  3. Invalidate previous reset tokens for this user
  4. Create new reset token
  5. Send email with reset link (include token)
  6. Return success message

- `validateResetToken(token)`: Check token validity
  - Not expired
  - Not already used
  - Return `PasswordResetToken` with validation status

- `confirmPasswordReset(token, newPassword)`: Complete reset
  1. Validate token
  2. Validate new password strength
  3. If token invalid → error: "Enlace vencido"
  4. Hash new password
  5. Update user password
  6. Mark token as used
  7. Send confirmation email
  8. Return success

- `sendPasswordResetEmail(email, resetToken)`: Send email with link
  - Include reset URL: `/reset-password?token={token}`
  - Include 1-hour expiry notice

#### 5. Create PasswordResetHandler
**File:** `src/handlers/PasswordResetHandler.ts`

Endpoints:

```typescript
POST /api/auth/forgot-password
Body: {
  email: "user@example.com"
}

Response:
{
  exito: true,
  data: {
    mensaje: "Si el email existe en nuestros registros, recibirás un enlace para restablecer tu contraseña"
  }
}

POST /api/auth/reset-password
Body: {
  token: "xxxxx",
  nueva_contrasena: "NewSecurePass456!"
}

Response (success):
{
  exito: true,
  data: {
    mensaje: "Contraseña restablecida correctamente. Iniciá sesión con tu nueva contraseña."
  }
}

Response (expired):
{
  exito: false,
  code: 'TOKEN_VENCIDO',
  error: "Enlace vencido y puedo solicitar uno nuevo"
}

GET /api/auth/reset-password/validate?token=xxxxx
Response:
{
  exito: true,
  data: {
    valido: true,
    fecha_vencimiento: "2025-01-01T11:00:00Z"
  }
}
```

#### 6. Add Routes
**File:** `src/routes/index.ts`

```typescript
router.post('/auth/forgot-password',
  (req, res) => passwordResetHandler.requestReset(req, res));
router.post('/auth/reset-password',
  (req, res) => passwordResetHandler.confirmReset(req, res));
router.get('/auth/reset-password/validate',
  (req, res) => passwordResetHandler.validateToken(req, res));
```

---

## HU-CR-13: Login Attempt Blocking

### Acceptance Criteria
- Block account after 5 failed attempts
- Lock for 15 minutes
- Send email notification
- Allow retry after 15 minutes or via password recovery

### Implementation Steps

#### 1. Update Database Schema
```sql
-- login_attempts table
CREATE TABLE login_attempts (
  id_intento UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id UUID NOT NULL REFERENCES users(usuario_id),
  email VARCHAR(255) NOT NULL,
  intento_exitoso BOOLEAN NOT NULL,
  ip_address VARCHAR(50),
  user_agent VARCHAR(500),
  fecha_intento TIMESTAMP DEFAULT NOW(),
  INDEX idx_usuario_fecha (usuario_id, fecha_intento),
  INDEX idx_email_fecha (email, fecha_intento)
);

-- Update users table to add lock info
ALTER TABLE users ADD COLUMN fecha_bloqueo_login TIMESTAMP;
ALTER TABLE users ADD COLUMN razon_bloqueo VARCHAR(100);
```

#### 2. Update Type Definitions
**File:** `src/types/index.ts`

```typescript
enum LoginBlockReason {
  INTENTOS_EXCEDIDOS = 'intentos_excedidos',
  MANUAL = 'manual',
  FRAUDE_DETECTADO = 'fraude_detectado'
}

interface LoginAttempt {
  id_intento: string;
  usuario_id?: string;
  email: string;
  intento_exitoso: boolean;
  ip_address: string;
  user_agent: string;
  fecha_intento: Date;
}

interface LoginAttemptResult {
  permitido: boolean;
  intentos_restantes?: number;
  fecha_desbloqueo?: Date;
  razon_bloqueo?: LoginBlockReason;
}
```

#### 3. Create LoginAttemptsRepository
**File:** `src/repositories/LoginAttemptsRepository.ts`

Methods:
- `recordLoginAttempt(email, success, ipAddress, userAgent)`: Log attempt
- `getRecentFailedAttempts(email, minutosAtras = 60)`: Count recent failures
- `lockAccount(userId, razonBloqueo)`: Set fecha_bloqueo_login
- `unlockAccount(userId)`: Clear lock
- `isAccountLocked(userId)`: Check lock status
- `getLockTimeRemaining(userId)`: Minutes until unlock
- `deleteOldAttempts(diasAtras = 30)`: Clean up old records

#### 4. Create LoginSecurityService
**File:** `src/services/LoginSecurityService.ts`

Methods:
- `checkLoginAttempts(email)`: Pre-login check
  1. Get failed attempts in last 60 minutes
  2. If >= 5 → lock account
  3. Return `LoginAttemptResult`
  4. Include retry time if locked

- `recordLoginAttempt(email, success, ipAddress, userAgent)`:
  1. Check if account needs to be locked (5 failures = auto-lock)
  2. If locked → set fecha_bloqueo_login = now + 15 min
  3. Send email if newly locked
  4. Record attempt

- `unlockAccountAfterTime(userId)`: Check if 15 min expired
  - If yes, clear lock
  - Return true

- `canAttemptLogin(userId)`: Combined check
  - Is account locked?
  - Has 15 min elapsed?
  - Return boolean + reason if denied

#### 5. Update LoginService
**File:** `src/services/LoginService.ts` (existing)

Modify `authenticateUser()`:
1. Before querying user: call `loginSecurityService.checkLoginAttempts(email)`
2. If account locked → return error: "Tu cuenta está bloqueada. Intenta en X minutos o recupera tu contraseña"
3. After password check, call `loginSecurityService.recordLoginAttempt()`
4. If failed → decrement login_attempts_remaining
5. If locked on this attempt → send email notification

#### 6. Create LoginSecurityHandler
**File:** `src/handlers/LoginSecurityHandler.ts`

Optional endpoints:
```typescript
GET /api/auth/account-status
Headers: { Authorization: "Bearer {token}" }

Response:
{
  exito: true,
  data: {
    bloqueada: false,
    intentos_fallidos: 0,
    fecha_ultimo_intento: "2025-01-01T10:30:00Z"
  }
}
```

#### 7. Add Email Notification
**File:** `src/services/EmailService.ts` (update)

Add method:
- `sendAccountLockedNotification(email, desbloqueoEn)`: Send lock warning
  - Subject: "Tu cuenta ha sido bloqueada por seguridad"
  - Body: "Se detectaron múltiples intentos fallidos. Tu cuenta estará bloqueada por 15 minutos."
  - Include link to password recovery

#### 8. Update LoginHandler
**File:** `src/handlers/LoginHandler.ts` (existing)

Update error response:
```typescript
Response (account locked):
{
  exito: false,
  code: 'CUENTA_BLOQUEADA',
  error: "Tu cuenta está bloqueada. Intenta en 12 minutos o recupera tu contraseña",
  data: {
    desbloqueada_en_minutos: 12,
    recuperar_contrasena_url: "/forgot-password"
  }
}
```

#### 9. Add Scheduled Job (Optional)
**File:** `src/jobs/UnlockAccountsJob.ts`

Scheduled task (runs every 5 min):
- Query accounts locked > 15 min ago
- Call `loginSecurityService.unlockAccountAfterTime()`
- Send email: "Tu cuenta ha sido desbloqueada"

#### 10. Add Routes
**File:** `src/routes/index.ts`

```typescript
router.get('/auth/account-status', verifyToken,
  (req, res) => loginSecurityHandler.getAccountStatus(req, res));
```

---

## Summary: Files to Create/Update

### New Files (User Management Module)
1. `src/repositories/UsersRepository.ts`
2. `src/repositories/LoginAttemptsRepository.ts`
3. `src/repositories/PasswordResetRepository.ts`
4. `src/services/RegistrationService.ts`
5. `src/services/LoginService.ts`
6. `src/services/PasswordService.ts`
7. `src/services/PasswordResetService.ts`
8. `src/services/LoginSecurityService.ts`
9. `src/services/EmailService.ts`
10. `src/services/BiometryService.ts` (if new)
11. `src/handlers/RegistrationHandler.ts`
12. `src/handlers/LoginHandler.ts`
13. `src/handlers/PasswordResetHandler.ts`
14. `src/handlers/LoginSecurityHandler.ts`

### New Files (Transfer Features Module)
15. `src/repositories/TransfersRepository.ts`
16. `src/repositories/LimitsRepository.ts`
17. `src/repositories/FraudCheckRepository.ts`
18. `src/repositories/ExternalAccountsRepository.ts`
19. `src/repositories/KycDocumentsRepository.ts`
20. `src/services/TransfersService.ts` (new or update existing)
21. `src/services/FraudCheckService.ts`
22. `src/services/KycService.ts`
23. `src/services/BankCbuValidator.ts`
24. `src/handlers/TransfersHandler.ts` (new or update)
25. `src/handlers/KycHandler.ts`

### Files to Update
1. `src/types/index.ts` - Add all new interfaces
2. `src/routes/index.ts` - Add all new routes
3. `src/middleware/authMiddleware.ts` - Enhance token verification
4. `src/handlers/TransferHandler.ts` - Integrate fraud checks, limits
5. `src/services/BankingAPI.ts` - Update for external transfers
6. `package.json` - Add new dependencies:
   - `bcrypt` - password hashing
   - `pdfkit` - PDF generation
   - `qrcode` - QR code generation
   - `nodemailer` - email sending (or use SendGrid)
   - `axios` - HTTP requests for external validation
7. `src/index.ts` - Register new routes and handlers
8. `src/errors/AppError.ts` - Add new error types

### Database Migrations
- Create `migrations/` directory
- File: `001_create_users_table.sql`
- File: `002_create_transfers_table.sql`
- File: `003_create_kyc_tables.sql`
- File: `004_create_fraud_tables.sql`
- File: `005_create_password_reset_table.sql`
- File: `006_create_login_attempts_table.sql`

---

## Implementation Order (Recommended)

1. **Phase 1: User Management (HU-CR-10, 11, 12, 13)**
   - Implement registration → login → password recovery → attempt blocking
   - Database: users, password_reset_tokens, login_attempts
   - This is the foundation for all other features

2. **Phase 2: KYC & Limits (HU-CR-09, 07)**
   - Implement KYC upload and validation
   - Implement transfer limits and fraud checks
   - Database: kyc_documents, kyc_validation_result, transfer_limits, fraud_checks, daily_transfer_logs

3. **Phase 3: Transfers (HU-CR-06, 08)**
   - Implement transfer receipts
   - Implement external CBU/CVU transfers
   - Database: transfers, comprobantes, external_accounts, external_transfer_logs

---

## Testing Recommendations

### Unit Tests
- PasswordService.hashPassword/verifyPassword
- PasswordResetService token generation/validation
- FraudCheckService limit calculations
- BankCbuValidator CBU validation

### Integration Tests
- Registration flow: email → verification → login
- Login with rate limiting
- Transfer with fraud checks
- KYC document upload → validation → limit update

### End-to-End Tests
- Complete user journey: register → add funds → set KYC → transfer → view receipt
- External transfer with PIN verification
- Password recovery flow

---

## Security Considerations

1. **Password Storage**: Use bcrypt with salt rounds = 10
2. **Tokens**: Use HS256 or RS256 for JWT
3. **Rate Limiting**: Implement on login and password reset endpoints
4. **HTTPS Only**: Ensure all endpoints require HTTPS in production
5. **CORS**: Restrict to known frontend domains
6. **Input Validation**: Sanitize all inputs, validate formats
7. **SQL Injection**: Use parameterized queries (Supabase client does this)
8. **XSS Prevention**: Sanitize file uploads, never trust user input
9. **CSRF**: Include CSRF tokens if using session cookies
10. **Sensitive Data**: Never log passwords, PII, or tokens
11. **Email Verification**: Implement to prevent spam accounts
12. **KYC Validation**: Integrate with real document validation service
13. **Audit Trail**: Log all sensitive operations (logins, transfers, KYC)

---

## Error Codes Reference

| Code | HTTP | Description |
|------|------|-------------|
| EMAIL_EXISTE | 400 | Email already registered |
| VALIDACION_FALLIDA | 400 | Input validation failed |
| CREDENCIALES_INVALIDAS | 401 | Email/password incorrect |
| CUENTA_BLOQUEADA | 403 | Account locked (15 min) |
| LIMITE_EXCEDIDO | 400 | Transfer limit exceeded |
| CBU_INVALIDO | 400 | Invalid CBU/CVU |
| TOKEN_VENCIDO | 400 | Password reset token expired |
| FONDOS_INSUFICIENTES | 400 | Insufficient balance |
| FRAUDE_DETECTADO | 403 | Fraud check failed |
| VERIFICACION_FALLIDA | 400 | Biometry/PIN verification failed |

---

## Frontend Integration Notes

### Required API Integration Points
- Register endpoint with email verification flow
- Login with token storage (localStorage/sessionStorage)
- KYC document upload with progress indicator
- Transfer form with real-time limit validation
- Receipt PDF download/share
- Account status checks

### Required UI Components
- Registration form (email, password, DNI, name)
- Login form (email, password)
- Password recovery form (email + reset confirmation)
- KYC document upload (drag-drop, image capture)
- Transfer form (amount, recipient, method, verification)
- Receipt detail view (shareable, downloadable)
- Dashboard with limits and account status

---

## Deployment Checklist

- [ ] Database migrations applied
- [ ] Environment variables configured
- [ ] Email service configured (SMTP or SendGrid)
- [ ] External APIs configured (OCR, BCRA validation)
- [ ] File storage configured (Supabase, S3)
- [ ] JWT secret generated and secured
- [ ] CORS configured
- [ ] Rate limiting configured
- [ ] Logging configured
- [ ] Error tracking configured (Sentry, etc.)
- [ ] Tests passing
- [ ] Security audit completed

