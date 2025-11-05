# Mi Pago - Feature Implementation Guide

## Overview

This document describes the new features implemented for enhanced user account security, KYC document management, and external transfer capabilities (CBU/CVU).

## New Features Implemented

### 1. TransferHandler - External Transfer Management

**Location:** `src/handlers/TransferHandler.ts`

#### New Endpoints

1. **POST /api/transfers/external/validate-cbu**
   - Validates CBU/CVU format before transfer
   - Returns bank information for valid accounts
   ```json
   {
     "usuario_id": "user123",
     "cuenta": "0170835104000003141816"
   }
   ```

2. **POST /api/transfers/external/execute**
   - Executes transfer to external CBU/CVU account
   - Validates limits, fraud checks, and account status
   ```json
   {
     "usuario_id": "user123",
     "cbu_destino": "0170835104000003141816",
     "alias_destino": "juan.alias",
     "monto_transferencia": 5000,
     "referencia": "Pago servicios"
   }
   ```

3. **POST /api/transfers/external/preview**
   - Previews transfer without executing
   - Shows all checks and validations
   ```json
   {
     "usuario_id": "user123",
     "cbu_destino": "0170835104000003141816",
     "monto_transferencia": 5000
   }
   ```

#### Features
- CBU/CVU validation (22 or 10 digits)
- Bank identification from account number
- Transfer limit enforcement (10,000 for basic, 50,000 for KYC-approved)
- Fraud detection:
  - New account + high amount
  - Frequent transfers in short time
  - Default history checks
- Transaction receipts with bank details
- Comprehensive error handling

---

### 2. UserAccountService - Account & Security Management

**Location:** `src/services/UserAccountsService.ts`

#### Password Management

```typescript
// Hash password before storage
const hashedPassword = userAccountsService.hashPassword('myPassword123');

// Validate credentials during login
const isValid = await userAccountsService.validateCredentials(userId, password);

// Update password
await userAccountsService.updatePassword(userId, newPassword);

// Password reset flow
const token = await userAccountsService.createPasswordResetToken(userId);
// Later...
await userAccountsService.updatePasswordWithResetToken(token, newPassword);
```

#### Account Security

```typescript
// Check if account is blocked
const isBlocked = await userAccountsService.isAccountBlocked(userId);

// Block account (after max failed attempts or manual)
await userAccountsService.blockAccount(userId);

// Unblock account
await userAccountsService.unblockAccount(userId);
```

#### KYC Document Management

```typescript
// Upload KYC documents
const dniDoc = await userAccountsService.uploadKYCDocument(
  userId,
  'dni',
  'https://storage.example.com/dni123.jpg'
);

const selfieDoc = await userAccountsService.uploadKYCDocument(
  userId,
  'selfie',
  'https://storage.example.com/selfie123.jpg'
);

// Retrieve documents
const documents = await userAccountsService.getKYCDocuments(userId);

// Approve KYC (requires DNI + selfie)
await userAccountsService.approveKYC(userId);
// Automatically sets: kyc_completo = true, kyc_status = 'aprobado', limite_transferencia = 50000

// Reject KYC
await userAccountsService.rejectKYC(userId, 'Documento no legible');
```

#### Transfer Limits

```typescript
// Get user's transfer limit
const limit = await userAccountsService.getTransferLimit(userId);
// Returns: 10000 (basic) or 50000 (KYC-approved)

// Update transfer limit (admin use)
await userAccountsService.updateTransferLimit(userId, 100000);
```

---

### 3. UserAccountRepository - Data Persistence

**Location:** `src/repositories/UserAccountsRepository.ts`

#### New Database Methods

**Password Management:**
- `updatePassword(userId, passwordHash)` - Store hashed password
- `getPasswordHash(userId)` - Retrieve password hash
- `recordFailedLoginAttempt(userId)` - Track failed attempts
- `resetFailedLoginAttempts(userId)` - Clear failed attempts counter

**Account Blocking:**
- `blockAccount(userId)` - Block account
- `unblockAccount(userId)` - Unblock and reset attempts
- `isAccountBlocked(userId)` - Check block status

**KYC Documents:**
- `storeKYCDocument(documento)` - Store document metadata
- `getKYCDocuments(userId)` - Retrieve user's documents
- `updateKYCStatus(userId, status)` - Update KYC approval status
- `getKYCStatus(userId)` - Get current KYC status

**Password Reset:**
- `createPasswordResetToken(userId)` - Generate reset token (24h expiry)
- `validatePasswordResetToken(token)` - Verify token validity
- `markResetTokenAsUsed(token)` - Mark token as consumed
- `getUserIdFromResetToken(token)` - Get user from token

**Transfer Limits:**
- `updateTransferLimit(userId, limit)` - Set user's transfer limit
- `getTransferLimit(userId)` - Retrieve user's limit (default 10,000)

---

### 4. BankingAPI - External Transfer & Validation

**Location:** `src/services/BankingAPI.ts`

#### CBU/CVU Validation

```typescript
// Validate account format
const validation = bankingAPI.validateExternalAccount(cuenta);
// Returns: { es_valido, cbu, banco?, alias?, activo, razon_invalido? }

// Specific format validation
const cbuValidation = bankingAPI.validateCBUFormat('0170835104000003141816');
const cvuValidation = bankingAPI.validateCVUFormat('1234567890');
```

#### External Transfer Execution

```typescript
const transferRequest: ExternalTransferRequest = {
  usuario_id: 'user123',
  cbu_destino: '0170835104000003141816',
  monto: 5000,
  referencia: 'Pago servicios'
};

const result = await bankingAPI.executeExternalTransfer(transferRequest);
// Returns: ExternalTransferResult with:
// - exito: boolean
// - id_transferencia: UUID
// - transaccion_numero: reference number
// - estado: 'acreditada' | 'fallida'
// - comprobante: { numero, fecha, referencia }
```

#### Transfer Limit Validation

```typescript
const isWithinLimit = await bankingAPI.validateTransferLimit(userId, monto);
// Checks if monto <= user's transfer limit
```

#### Bank Database

Supports 47+ Argentine banks including:
- Banco Nación (001)
- Banco Provincia (002)
- BBVA Francés (006)
- Banco Santander (011)
- Banco Galicia (017)
- Mercado Pago (045)
- And more...

---

## Database Schema Changes

### New Tables

1. **kyc_documents**
   - Stores uploaded DNI, selfie, and other documents
   - Tracks validation status and rejection reasons
   - Indexed for quick lookups

2. **password_reset_tokens**
   - Stores temporary reset tokens (24-hour expiry)
   - One-time use tokens
   - Automatic cleanup via expiry

3. **transfer_details**
   - Extended transfer information
   - Bank destination, fraud risk assessment
   - Expected crediting date

4. **fraud_logs**
   - Audit trail of fraud risk assessments
   - Severity levels (baja, media, alta)
   - Tracks blocked transfers

5. **account_lock_history**
   - Complete history of account blocks
   - Reasons and auto/manual unlock
   - Compliance tracking

6. **kyc_validation_logs**
   - Audit trail for KYC decisions
   - Documents reviewed, observations
   - Decision maker tracking

7. **external_transfer_logs**
   - Log of all CBU/CVU transfers
   - Validation results and outcomes
   - Bank transaction numbers

### Modified Tables

**user_accounts** - Added columns:
- `password_hash` - PBKDF2 hashed password with salt
- `bloqueado` - Boolean flag for account lock
- `intentos_fallidos` - Failed login attempt counter
- `fecha_proximo_intento` - Automatic unlock timestamp
- `email` - User email for communications
- `kyc_status` - Detailed KYC approval status
- `limite_transferencia` - Dynamic transfer limit

See `MIGRATION_SCHEMA_UPDATES.sql` for complete schema.

---

## Security Features

### Password Security

**Algorithm:** PBKDF2 with SHA-512
- 1000 iterations
- 16-byte random salt per password
- Storage format: `{salt}.{hash}` (both hex-encoded)

**Policy:**
- Minimum 8 characters
- Cannot be reset more than once per day
- Reset tokens expire after 24 hours

### Account Locking

**Automatic Locking:**
- After 5 failed login attempts
- Temporary lock for 1 hour (auto-unlock)
- Attempt counter resets on successful login

**Manual Locking:**
- Admin can block account for fraud/compliance
- Requires manual unlock from admin

### Fraud Detection

Transfers are checked for:

1. **New Account + High Amount**
   - Account < 30 days old
   - Amount > $5,000
   - Severity: Medium (warning)

2. **Frequent Transfers**
   - More than 10 transfers in a day
   - Severity: High (blocking)

3. **Default History**
   - User has prior defaults
   - Severity: High (blocking)

### KYC Validation

**Required Documents:**
- DNI (National ID)
- Selfie (Face verification)
- Optionally: Address proof

**Status Flow:**
```
pendiente (uploaded)
    ↓
en_revision (under review)
    ↓
aprobado (KYC complete) ← Transfer limit: 50,000
    ↓ or
rechazado (KYC rejected) ← Transfer limit: 10,000
```

---

## API Integration Examples

### Example 1: Complete KYC Flow

```bash
# Step 1: Upload DNI
curl -X POST http://localhost:3000/api/accounts/kyc/upload \
  -H "Content-Type: application/json" \
  -d '{
    "usuario_id": "user123",
    "tipo_documento": "dni",
    "url_documento": "https://storage.example.com/dni.jpg"
  }'

# Step 2: Upload Selfie
curl -X POST http://localhost:3000/api/accounts/kyc/upload \
  -H "Content-Type: application/json" \
  -d '{
    "usuario_id": "user123",
    "tipo_documento": "selfie",
    "url_documento": "https://storage.example.com/selfie.jpg"
  }'

# Step 3: Approve KYC (Admin)
curl -X POST http://localhost:3000/api/accounts/kyc/approve \
  -H "Content-Type: application/json" \
  -d '{"usuario_id": "user123"}'
# Result: kyc_completo = true, limite_transferencia = 50000
```

### Example 2: External Transfer with CBU

```bash
# Step 1: Validate CBU
curl -X POST http://localhost:3000/api/transfers/external/validate-cbu \
  -H "Content-Type: application/json" \
  -d '{"cuenta": "0170835104000003141816"}'

# Step 2: Preview transfer
curl -X POST http://localhost:3000/api/transfers/external/preview \
  -H "Content-Type: application/json" \
  -d '{
    "usuario_id": "user123",
    "cbu_destino": "0170835104000003141816",
    "monto_transferencia": 5000
  }'

# Step 3: Execute transfer
curl -X POST http://localhost:3000/api/transfers/external/execute \
  -H "Content-Type: application/json" \
  -d '{
    "usuario_id": "user123",
    "cbu_destino": "0170835104000003141816",
    "monto_transferencia": 5000,
    "referencia": "Pago servicios"
  }'
```

### Example 3: Password Reset Flow

```bash
# Step 1: Request password reset
curl -X POST http://localhost:3000/api/accounts/password-reset/request \
  -H "Content-Type: application/json" \
  -d '{"usuario_id": "user123"}'
# Returns: { resetToken: "abc123..." }

# Step 2: User clicks link in email and submits new password
curl -X POST http://localhost:3000/api/accounts/password-reset/confirm \
  -H "Content-Type: application/json" \
  -d '{
    "token": "abc123...",
    "nueva_contraseña": "newPassword123!"
  }'
```

---

## Error Handling

All endpoints return consistent error responses:

```json
{
  "exito": false,
  "error": "Error description",
  "codigo": "ERROR_CODE",
  "detalles": {}
}
```

### Common Error Codes

| Code | Description |
|------|-------------|
| `INVALID_ACCOUNT` | CBU/CVU format invalid |
| `ACCOUNT_INACTIVE` | Destination account inactive |
| `INSUFFICIENT_BALANCE` | User doesn't have enough funds |
| `LIMITE_EXCEDIDO` | Transfer exceeds daily limit |
| `FRAUD_RISK` | Transfer blocked due to fraud risk |
| `CUENTA_BLOQUEADA` | User account is locked |
| `CONTRASEÑA_INVALIDA` | Password validation failed |
| `DOCUMENTO_INCOMPLETO` | Missing required KYC documents |

---

## Testing Recommendations

### Unit Tests

1. **Password Hashing**
   - Test hash generation and verification
   - Test password validation
   - Test salt randomization

2. **CBU/CVU Validation**
   - Test valid CBU (22 digits)
   - Test valid CVU (10 digits)
   - Test invalid formats
   - Test bank code mapping

3. **Fraud Detection**
   - Test new account + high amount
   - Test frequent transfers
   - Test default history flag

### Integration Tests

1. **Complete KYC Workflow**
   - Upload documents
   - Approve/reject KYC
   - Verify limits updated

2. **External Transfer Flow**
   - Validate CBU
   - Check limits
   - Execute transfer
   - Verify balance changes

3. **Account Security**
   - Failed login attempts
   - Auto account locking
   - Password reset flow

### Mock Data

```typescript
// Test user with KYC complete
{
  usuario_id: 'test-user-kyc',
  kyc_completo: true,
  kyc_status: 'aprobado',
  limite_transferencia: 50000,
  bloqueado: false
}

// Test CBU for Banco Nación
'0010000012345678901234'

// Test valid password
'TestPassword123'
```

---

## Performance Considerations

### Indexes
- `idx_user_accounts_kyc_status` - KYC status queries
- `idx_user_accounts_bloqueado` - Account lock checks
- `idx_kyc_documents_estado` - Document state lookups
- `idx_password_reset_tokens_expiry` - Token cleanup

### Query Optimization
- Use indexed columns in WHERE clauses
- Batch fraud checks for multiple transfers
- Cache bank mapping database

### Rate Limiting (Recommended)
- 5 failed login attempts → 1 hour lock
- 10 transfers/day → fraud review
- 1 password reset/day per user

---

## Deployment Checklist

- [ ] Run `MIGRATION_SCHEMA_UPDATES.sql` migration
- [ ] Test all new API endpoints
- [ ] Configure email service for password reset (future)
- [ ] Set up fraud monitoring dashboard
- [ ] Train admins on KYC approval workflow
- [ ] Enable audit logging for transfers
- [ ] Set up backups for KYC documents
- [ ] Configure bank CBU/CVU validation service
- [ ] Test with sample CBU numbers
- [ ] Monitor transaction volumes

---

## Future Enhancements

1. **Two-Factor Authentication**
   - SMS/Email OTP for high-value transfers
   - TOTP support

2. **Biometric Authentication**
   - Fingerprint/Face unlock
   - Device binding

3. **Advanced Fraud Detection**
   - Machine learning models
   - Geographic anomaly detection
   - Behavioral analysis

4. **Real Bank Integration**
   - Connection to CAJA/LICH/ALET (clearing houses)
   - BCRA CBU database queries
   - Real-time bank status

5. **Payment Confirmations**
   - SMS/Email notifications
   - Push notifications
   - Transaction receipts via email

6. **Admin Dashboard**
   - KYC approval workflow
   - Fraud monitoring
   - Account management
   - Transfer audit trail

---

## Support & Documentation

- API Documentation: See routes in `src/routes/index.ts`
- Type Definitions: See `src/types/index.ts`
- Error Handling: See `src/errors/AppError.ts`
- Configuration: See `.env` file

For questions or issues, refer to the main project README.
