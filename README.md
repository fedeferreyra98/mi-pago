# Mi Pago - Digital Wallet with Credit System

A comprehensive backend implementation for a digital wallet system with integrated quick and normal credit offerings. Built with Node.js, Express, TypeScript, and Supabase.

## Project Overview

Mi Pago is a university project that implements a fintech solution enabling users to:
- Manage digital wallets with account balances
- Request quick credits (30/60/90 days) for urgent needs
- Apply for normal credits (3/6/9/12 months) for planned expenses
- Automatically track and manage credit installments
- Handle payment defaults and penalties

## Technology Stack

- **Backend**: Node.js + Express.js
- **Language**: TypeScript
- **Database**: Supabase (PostgreSQL)
- **Authentication**: JWT
- **Hosting**: Vercel (Backend) + Supabase (Database)
- **Frontend**: React + Material-UI (separate repository)

## Project Structure

```
mi-pago/
├── src/
│   ├── config/              # Configuration files
│   │   ├── config.ts        # App configuration
│   │   └── supabase.ts      # Supabase client
│   ├── types/               # TypeScript type definitions
│   │   └── index.ts         # All types and interfaces
│   ├── errors/              # Error classes
│   │   └── AppError.ts      # Custom error types
│   ├── middleware/          # Express middleware
│   │   ├── authMiddleware.ts      # JWT authentication
│   │   └── errorMiddleware.ts     # Error handling
│   ├── repositories/        # Data access layer
│   │   ├── UserAccountsRepository.ts
│   │   └── CreditsRepository.ts
│   ├── services/            # Business logic layer
│   │   ├── UserAccountsService.ts
│   │   ├── CreditsService.ts
│   │   ├── CreditsValidator.ts
│   │   └── BankingAPI.ts    # Mock banking simulation
│   ├── handlers/            # HTTP request handlers
│   │   ├── UserAccountsHandler.ts
│   │   ├── CreditsHandler.ts
│   │   └── TransferHandler.ts
│   ├── routes/              # API routes
│   │   └── index.ts
│   └── index.ts             # Main application entry point
├── .env.example             # Environment variables template
├── package.json
├── tsconfig.json
└── README.md
```

## Getting Started

### Prerequisites

- Node.js 16+
- npm or yarn
- Supabase account and project

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd mi-pago
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment variables**
   ```bash
   cp .env.example .env
   ```

   Edit `.env` with your Supabase credentials:
   ```
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_KEY=your-anonymous-key
   JWT_SECRET=your-secret-key
   PORT=3000
   ```

4. **Set up Supabase database schema**

   Create the following tables in your Supabase project:

   **user_accounts table**:
   ```sql
   CREATE TABLE user_accounts (
     usuario_id UUID PRIMARY KEY,
     kyc_completo BOOLEAN DEFAULT FALSE,
     fecha_registro TIMESTAMP DEFAULT NOW(),
     saldo_disponible DECIMAL(15,2) DEFAULT 0,
     ingresos_declarados DECIMAL(15,2),
     historial_mora BOOLEAN DEFAULT FALSE,
     score_externo INTEGER,
     fecha_actualizacion TIMESTAMP DEFAULT NOW()
   );
   ```

   **creditos table**:
   ```sql
   CREATE TABLE creditos (
     id_credito UUID PRIMARY KEY,
     usuario_id UUID REFERENCES user_accounts(usuario_id),
     tipo_credito VARCHAR(50) CHECK (tipo_credito IN ('rapido', 'normal')),
     monto_solicitado DECIMAL(15,2),
     monto_total DECIMAL(15,2),
     plazo_dias INTEGER,
     tasa_tea DECIMAL(5,2),
     tasa_cft DECIMAL(5,2),
     estado VARCHAR(50) CHECK (estado IN ('preaprobado', 'aprobado', 'desembolsado', 'en_curso', 'pagado', 'en_mora', 'cancelado')),
     fecha_desembolso TIMESTAMP,
     fecha_vencimiento TIMESTAMP,
     cuotas INTEGER,
     fecha_creacion TIMESTAMP DEFAULT NOW(),
     fecha_actualizacion TIMESTAMP DEFAULT NOW()
   );
   ```

   **cuotas table**:
   ```sql
   CREATE TABLE cuotas (
     id_cuota UUID PRIMARY KEY,
     id_credito UUID REFERENCES creditos(id_credito),
     nro_cuota INTEGER,
     importe_cuota DECIMAL(15,2),
     fecha_vencimiento TIMESTAMP,
     estado VARCHAR(50) CHECK (estado IN ('pendiente', 'pagada', 'impaga', 'reintentando')),
     fecha_pago TIMESTAMP
   );
   ```

5. **Start the development server**
   ```bash
   npm run dev
   ```

   The server will start on `http://localhost:3000`

## API Endpoints

### Authentication

**Login/Register** (Mock - Returns JWT Token)
```
POST /api/auth/login
POST /api/auth/register
```

### User Accounts

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/accounts` | Create new user account |
| GET | `/api/accounts/:usuario_id` | Get account information |
| GET | `/api/accounts/:usuario_id/balance` | Get account balance |
| POST | `/api/accounts/funds/add` | Add funds to account |
| POST | `/api/accounts/kyc/complete` | Complete KYC process |
| POST | `/api/accounts/income/declare` | Declare monthly income |
| POST | `/api/accounts/scoring/set` | Set external credit score |
| GET | `/api/accounts/:usuario_id/eligibility` | Check eligibility requirements |

### Credits

#### Eligibility & Validation
```
POST /api/credits/quick-credit/eligibility
POST /api/credits/normal-credit/eligibility
```

#### Simulation
```
POST /api/credits/quick-credit/simulate
POST /api/credits/normal-credit/simulate
```

**Request Body**:
```json
{
  "usuario_id": "user-uuid",
  "monto": 10000,
  "plazo_dias": 30,  // For quick credit: 30, 60, 90
  "plazo_meses": 6   // For normal credit: 3, 6, 9, 12
}
```

#### Credit Request & Management
```
POST /api/credits/quick-credit/request
POST /api/credits/normal-credit/request
POST /api/credits/:id_credito/accept
GET /api/credits/user/:usuario_id
GET /api/credits/:id_credito/detail
```

### Transfers

```
POST /api/transfers/analyze           # Analyze transfer possibility
POST /api/transfers/execute           # Execute transfer (with auto quick-credit offer)
POST /api/transfers/execute-with-credit  # Execute after credit approval
```

**Transfer Request**:
```json
{
  "usuario_id": "user-uuid",
  "monto_destino": 10000,
  "cuenta_destino": "destination-account"
}
```

## Credit Types

### Quick Credit (Crédito Rápido)
- **Terms**: 30, 60, 90 days
- **Max Amount**: $50,000
- **TEA Rate**: 110-120% (based on term)
- **CFT Rate**: 125-135% (based on term)
- **Disbursement**: Instant
- **Requirements**:
  - KYC completed
  - Account age > 30 days
  - No default history
  - Debt-to-income ratio ≤ 40%

### Normal Credit (Crédito Normal)
- **Terms**: 3, 6, 9, 12 months
- **Max Amount**: $250,000
- **TEA Rate**: 85-95% (based on term)
- **CFT Rate**: 95-110% (based on term)
- **Disbursement**: Upon approval
- **Requirements**:
  - KYC completed
  - Income declared
  - No active defaults
  - External score ≥ 50 (if enabled)

## Rate Calculations

### Quick Credit Rates (Reference: MP TEA = 100%)
| Term | TEA | CFT |
|------|-----|-----|
| 30 days | 110% | 125% |
| 60 days | 115% | 130% |
| 90 days | 120% | 135% |

### Normal Credit Rates (Reference: MP TEA = 100%)
| Term | TEA | CFT |
|------|-----|-----|
| 3 months | 85% | 95% |
| 6 months | 90% | 100% |
| 12 months | 95% | 110% |

## Mock Banking API

The `BankingAPI` service simulates internal banking operations:

- **disburseCredit**: Simulates instant credit disbursement
- **processInstallmentPayment**: Processes monthly installment deductions
- **checkAvailableFunds**: Verifies user balance
- **transferFunds**: Simulates account-to-account transfers
- **schedulePaymentRetry**: Schedules retry for failed payments

## Business Logic

### Quick Credit Flow (from insufficient transfer)
1. User attempts transfer with insufficient balance
2. System detects shortfall and offers quick credit
3. User selects term (30/60/90 days)
4. System calculates rates and total amount
5. User accepts terms and conditions
6. Credit is instantly approved and disbursed
7. Transfer is completed automatically
8. Installment plan is created

### Normal Credit Flow (from module)
1. User accesses "Request Credit" module
2. System checks eligibility and pre-approved limit
3. User simulates amount and term
4. System displays rates and total cost
5. User submits application
6. Credit passes evaluation
7. Upon approval, credit is disbursed to wallet
8. Monthly payment plan is generated

### Default Management
- If installment unpaid after 3 days: +10% punitive interest (quick) or +5% (normal)
- Automatic retry 48 hours after due date
- User notifications via push/email
- Account marked as defaulter after extended non-payment

## Error Handling

All errors follow a standardized format:

```json
{
  "exito": false,
  "error": "Error message",
  "code": "ERROR_CODE"
}
```

### Common Error Codes
- `VALIDATION_ERROR`: Invalid input data
- `CREDIT_ELIGIBILITY_ERROR`: User not eligible for credit
- `INSUFFICIENT_FUNDS`: Not enough balance
- `NOT_FOUND`: Resource not found
- `DATABASE_ERROR`: Database operation failed
- `UNAUTHORIZED`: Missing/invalid authentication

## Development

### Build
```bash
npm run build
```

### Lint
```bash
npm run lint
```

### Test
```bash
npm test
```

### Production Start
```bash
npm start
```

## Security Considerations

- All sensitive operations require authentication (JWT)
- Database queries use parameterized statements (Supabase handles this)
- Error messages don't expose sensitive information
- CORS is configured for authorized domains
- Environment variables for all sensitive credentials
- Rate limiting recommended for production

## Compliance

The system is designed to comply with:
- BCRA (Central Bank of Argentina) digital credit regulations
- UIF (Financial Information Unit) KYC requirements
- Data protection and privacy standards

## Future Enhancements

- [ ] External scoring integration
- [ ] SMS/Email notification system
- [ ] Payment gateway integration
- [ ] Audit logging system
- [ ] Admin dashboard
- [ ] Advanced analytics
- [ ] Mobile app integration
- [ ] Real banking API integration

## Contributing

This is a university project. Please follow the specifications in `.claude/` directory.

## License

MIT

## Support

For issues or questions, please refer to the specification documents in `.claude/` directory.
