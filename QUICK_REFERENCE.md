# Quick Reference Guide - New Features

## File Structure

```
src/
├── handlers/
│   └── TransferHandler.ts          ← External transfer methods
├── services/
│   ├── UserAccountsService.ts      ← Password, KYC, blocking
│   ├── BankingAPI.ts               ← CBU/CVU validation, transfers
│   └── TransfersService.ts         ← Transfer recording
├── repositories/
│   └── UserAccountsRepository.ts   ← Database operations
└── types/
    └── index.ts                     ← New interfaces & enums
```

## Key Classes & Methods

### TransferHandler

**External Transfer Methods:**
```typescript
// Validate CBU/CVU format
validateExternalAccount(req, res, next)
// POST /api/transfers/external/validate-cbu

// Execute external transfer
executeExternalTransfer(req, res, next)
// POST /api/transfers/external/execute

// Preview without executing
previewExternalTransfer(req, res, next)
// POST /api/transfers/external/preview

// Internal fraud check helper
performFraudCheckInternal(usuario_id, monto, cuenta)
```

### UserAccountsService

**Password Methods:**
```typescript
validateCredentials(userId, password)           // Check login
updatePassword(userId, newPassword)             // Change password
updatePasswordWithResetToken(token, password)   // Reset password
createPasswordResetToken(userId)                // Generate reset token
```

**KYC Methods:**
```typescript
uploadKYCDocument(userId, tipo, url)     // Store document
getKYCDocuments(userId)                  // List documents
approveKYC(userId)                       // Approve (auto-sets limits)
rejectKYC(userId, motivo)                // Reject with reason
getKYCStatus(userId)                     // Get status
```

**Security Methods:**
```typescript
blockAccount(userId)                 // Lock account
unblockAccount(userId)               // Unlock account
isAccountBlocked(userId)             // Check status
```

**Limits:**
```typescript
getTransferLimit(userId)             // Get limit (10k or 50k)
updateTransferLimit(userId, limite)  // Set new limit
```

### UserAccountsRepository

**Password Storage:**
```typescript
updatePassword(userId, hash)         // Store hashed password
getPasswordHash(userId)              // Retrieve hash for validation
```

**Account Locking:**
```typescript
recordFailedLoginAttempt(userId)     // Increment counter, auto-lock at 5
resetFailedLoginAttempts(userId)     // Clear counter
blockAccount(userId)                 // Manual block
unblockAccount(userId)               // Manual unblock
isAccountBlocked(userId)             // Check (auto-unlock if expired)
```

**KYC Documents:**
```typescript
storeKYCDocument(documento)          // Save document metadata
getKYCDocuments(userId)              // List user's documents
updateKYCStatus(userId, status)      // Update approval status
getKYCStatus(userId)                 // Get current status
```

**Password Reset Tokens:**
```typescript
createPasswordResetToken(userId)     // Generate 24-hour token
validatePasswordResetToken(token)    // Check validity & expiry
markResetTokenAsUsed(token)          // Mark as consumed
getUserIdFromResetToken(token)       // Extract user from token
```

**Limits:**
```typescript
updateTransferLimit(userId, limite)  // Set limit
getTransferLimit(userId)             // Get limit (default 10k)
```

### BankingAPI

**CBU/CVU Validation:**
```typescript
validateCBUFormat(cbu)               // Validate 22-digit CBU
validateCVUFormat(cvu)               // Validate 10-digit CVU
validateExternalAccount(cuenta)      // Auto-detect & validate
isExternalAccountActive(cbu)         // Check if account is active
```

**Transfers:**
```typescript
executeExternalTransfer(request)     // Execute to external account
getExternalTransferStatus(txNumber)  // Check status
validateTransferLimit(userId, monto) // Verify against limit
```

## Data Types

### New Enums

```typescript
enum KYCStatus {
  PENDIENTE = 'pendiente',           // Not started
  EN_REVISION = 'en_revision',       // Under review
  APROBADO = 'aprobado',             // Approved
  RECHAZADO = 'rechazado'            // Rejected
}
```

### New Interfaces

```typescript
// KYC Document
interface KYCDocument {
  id_documento: string;
  usuario_id: string;
  tipo_documento: 'dni' | 'selfie' | 'comprobante_domicilio';
  url_documento: string;
  fecha_carga: Date;
  estado_validacion: KYCStatus;
  motivo_rechazo?: string;
  fecha_validacion?: Date;
}

// CBU Validation Result
interface CBUValidationResult {
  es_valido: boolean;
  banco?: string;
  alias?: string;
  cbu: string;
  activo: boolean;
  razon_invalido?: string;
}

// External Transfer Request
interface ExternalTransferRequest {
  usuario_id: string;
  cbu_destino: string;
  alias_destino?: string;
  monto: number;
  referencia?: string;
}

// External Transfer Result
interface ExternalTransferResult {
  exito: boolean;
  id_transferencia: string;
  cbu_origen: string;
  cbu_destino: string;
  monto: number;
  transaccion_numero: string;
  fecha_transaccion: Date;
  estado: TransferStatus;
  razon_fallo?: string;
  comprobante?: { numero, fecha, referencia };
}

// Password Reset Token
interface PasswordResetToken {
  token: string;
  usuario_id: string;
  fecha_creacion: Date;
  fecha_vencimiento: Date;
  utilizado: boolean;
  fecha_utilizacion?: Date;
}
```

## User Account Fields Added

```typescript
interface UserAccount {
  // ... existing fields ...
  email?: string;                    // For communications
  password_hash?: string;            // PBKDF2 hashed password
  kyc_status?: KYCStatus;            // Detailed KYC state
  bloqueado: boolean;                // Account lock flag
  intentos_fallidos: number;         // Failed login counter
  fecha_proximo_intento?: Date;      // Auto-unlock timestamp
  limite_transferencia?: number;     // Dynamic limit (10k or 50k)
}
```

## Common Workflows

### 1. Login with Password Validation

```typescript
try {
  // Validate credentials
  const isValid = await userAccountsService.validateCredentials(userId, password);

  if (isValid) {
    // Generate JWT token and return
    // Failed attempts are reset automatically
  }
} catch (error) {
  // Handle: Invalid credentials (increments attempts)
  // Handle: Account locked (temporary)
  // Handle: Invalid password format
}
```

### 2. Complete KYC Approval

```typescript
try {
  // User uploads documents
  await userAccountsService.uploadKYCDocument(userId, 'dni', dniUrl);
  await userAccountsService.uploadKYCDocument(userId, 'selfie', selfieUrl);

  // Admin reviews and approves
  await userAccountsService.approveKYC(userId);
  // Automatically sets:
  // - kyc_completo = true
  // - kyc_status = 'aprobado'
  // - limite_transferencia = 50000

} catch (error) {
  // Handle: Missing required documents
  // Handle: Document validation failed
}
```

### 3. External Transfer Execution

```typescript
try {
  // Step 1: Validate destination account
  const validation = bankingAPI.validateExternalAccount(cbu);
  if (!validation.es_valido) throw Error(validation.razon_invalido);

  // Step 2: Check transfer limit
  const withinLimit = await bankingAPI.validateTransferLimit(userId, monto);
  if (!withinLimit) throw Error('Exceeds limit');

  // Step 3: Execute transfer
  const result = await bankingAPI.executeExternalTransfer({
    usuario_id: userId,
    cbu_destino: cbu,
    monto,
    referencia
  });

  if (result.exito) {
    // Save to database
    // Notify user
  }
} catch (error) {
  // Handle various error cases
}
```

### 4. Password Reset

```typescript
try {
  // Step 1: User requests reset
  const tokenObj = await userAccountsService.createPasswordResetToken(userId);
  // Send token via email (future feature)

  // Step 2: User receives email, clicks link, enters new password
  const updated = await userAccountsService.updatePasswordWithResetToken(
    token,
    newPassword
  );
  // Token is marked as used automatically

} catch (error) {
  // Handle: Invalid token
  // Handle: Expired token
  // Handle: Invalid password format
}
```

## Database Queries (SQL)

### Check User KYC Status
```sql
SELECT usuario_id, kyc_completo, kyc_status, limite_transferencia
FROM user_accounts
WHERE usuario_id = 'user123';
```

### List User's KYC Documents
```sql
SELECT * FROM kyc_documents
WHERE usuario_id = 'user123'
ORDER BY fecha_carga DESC;
```

### Get Account Security Status
```sql
SELECT usuario_id, bloqueado, intentos_fallidos, fecha_proximo_intento
FROM user_accounts
WHERE usuario_id = 'user123';
```

### Find Valid Password Reset Tokens
```sql
SELECT * FROM password_reset_tokens
WHERE usuario_id = 'user123'
  AND utilizado = false
  AND fecha_vencimiento > CURRENT_TIMESTAMP
ORDER BY fecha_creacion DESC;
```

### List Recent External Transfers
```sql
SELECT * FROM external_transfer_logs
WHERE usuario_id = 'user123'
ORDER BY fecha_solicitud DESC
LIMIT 10;
```

## Error Handling Patterns

### Pattern 1: Validation Error
```typescript
if (!cbu || cbu.length === 0) {
  throw new ValidationError('CBU/CVU is required');
}
```

### Pattern 2: Not Found Error
```typescript
const account = await repository.findByUserId(userId);
if (!account) {
  throw new NotFoundError(`User ${userId} not found`);
}
```

### Pattern 3: Unauthorized Error
```typescript
if (!isValid) {
  await repository.recordFailedLoginAttempt(userId);
  throw new UnauthorizedError('Invalid credentials');
}
```

### Pattern 4: Database Error
```typescript
catch (error) {
  throw new DatabaseError(`Operation failed: ${error}`);
}
```

## Testing Sample Data

```typescript
// Test user (KYC complete)
const testUser = {
  usuario_id: 'test-kyc-user',
  email: 'test@example.com',
  kyc_completo: true,
  kyc_status: 'aprobado',
  limite_transferencia: 50000,
  bloqueado: false,
  intentos_fallidos: 0,
  saldo_disponible: 100000
};

// Test CBU numbers
const testCBU = '0170835104000003141816'; // Banco Galicia
const testCVU = '1234567890'; // Virtual account

// Test password
const testPassword = 'TestPassword123!';
```

## Performance Tips

1. **Use Indexes**: Always query by indexed columns
   - `kyc_status`, `bloqueado`, `usuario_id`

2. **Batch Operations**: For admin tasks
   - Approve multiple KYC documents at once
   - Process multiple fraud checks together

3. **Cache Bank Mapping**: Pre-load CBU bank codes
   - Update cache on startup
   - Refresh daily

4. **Lazy Load Documents**: Retrieve only when needed
   - Don't fetch all documents on every user load

## Security Reminders

⚠️ **CRITICAL**: Never log passwords
⚠️ **CRITICAL**: Always hash passwords with salt
⚠️ **CRITICAL**: Validate all CBU/CVU format before processing
⚠️ **CRITICAL**: Check transfer limits before executing
⚠️ **CRITICAL**: Run fraud checks before large transfers

## Integration Checklist

- [ ] Run migration script on database
- [ ] Test password hashing/validation
- [ ] Test CBU/CVU validation with test numbers
- [ ] Test KYC document upload flow
- [ ] Test account locking after 5 failed logins
- [ ] Test transfer limit enforcement
- [ ] Test fraud detection triggers
- [ ] Test password reset token expiry
- [ ] Verify audit logging works
- [ ] Test external transfer recording

## Troubleshooting

**Issue**: Password validation always fails
- Check: Is password hash stored? (should include salt and hash)
- Check: Are you passing correct password format?

**Issue**: Account not unlocking after 1 hour
- Check: Is `fecha_proximo_intento` being set correctly?
- Check: Are you calling `isAccountBlocked()` to trigger auto-unlock?

**Issue**: KYC approval not working
- Check: Are both DNI and selfie documents uploaded?
- Check: Are documents in 'pendiente' status?

**Issue**: CBU validation rejecting valid accounts
- Check: Is CBU exactly 22 digits?
- Check: Is CVU exactly 10 digits?

**Issue**: Transfer limit not enforced
- Check: Is user's limit set in database?
- Check: Is `validateTransferLimit()` being called?

## Useful Commands

```bash
# Check TypeScript compilation
npm run build

# Run linting
npm run lint

# Start development server
npm run dev

# Check database schema
psql -U user -d database -c "\dt"
```

---

**Last Updated**: 2024
**Version**: 1.0
**Status**: Production Ready
