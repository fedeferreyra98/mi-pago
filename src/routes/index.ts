import { Router } from 'express';
import { verifyToken, optionalAuth } from '@/middleware/authMiddleware.js';
import UserAccountsHandler from '@/handlers/UserAccountsHandler.js';
import CreditsHandler from '@/handlers/CreditsHandler.js';
import TransferHandler from '@/handlers/TransferHandler.js';

const router = Router();

// Health check endpoint
router.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date() });
});

// ============================================================
// USER ACCOUNTS ROUTES
// ============================================================
router.post('/accounts', UserAccountsHandler.createAccount.bind(UserAccountsHandler));
router.get('/accounts/:usuario_id', UserAccountsHandler.getAccount.bind(UserAccountsHandler));
router.get('/accounts/:usuario_id/balance', UserAccountsHandler.getBalance.bind(UserAccountsHandler));
router.post('/accounts/funds/add', UserAccountsHandler.addFunds.bind(UserAccountsHandler));
router.post('/accounts/kyc/complete', UserAccountsHandler.completeKYC.bind(UserAccountsHandler));
router.post('/accounts/income/declare', UserAccountsHandler.declareIncome.bind(UserAccountsHandler));
router.post('/accounts/scoring/set', UserAccountsHandler.setExternalScore.bind(UserAccountsHandler));
router.get(
  '/accounts/:usuario_id/eligibility',
  UserAccountsHandler.checkEligibilityRequirements.bind(UserAccountsHandler)
);

// ============================================================
// CREDITS ROUTES
// ============================================================

// Eligibility checks
router.post(
  '/credits/quick-credit/eligibility',
  CreditsHandler.checkQuickCreditEligibility.bind(CreditsHandler)
);
router.post(
  '/credits/normal-credit/eligibility',
  CreditsHandler.checkNormalCreditEligibility.bind(CreditsHandler)
);

// Simulations
router.post(
  '/credits/quick-credit/simulate',
  CreditsHandler.simulateQuickCredit.bind(CreditsHandler)
);
router.post(
  '/credits/normal-credit/simulate',
  CreditsHandler.simulateNormalCredit.bind(CreditsHandler)
);

// Credit requests
router.post(
  '/credits/quick-credit/request',
  CreditsHandler.requestQuickCredit.bind(CreditsHandler)
);
router.post(
  '/credits/normal-credit/request',
  CreditsHandler.requestNormalCredit.bind(CreditsHandler)
);

// Credit acceptance and disbursement
router.post(
  '/credits/:id_credito/accept',
  CreditsHandler.acceptCreditAndDisburse.bind(CreditsHandler)
);

// Get credits
router.get('/credits/user/:usuario_id', CreditsHandler.getUserCredits.bind(CreditsHandler));
router.get('/credits/:id_credito/detail', CreditsHandler.getCreditDetail.bind(CreditsHandler));

// ============================================================
// TRANSFER ROUTES
// ============================================================
router.post('/transfers/analyze', TransferHandler.analyzeTransfer.bind(TransferHandler));
router.post('/transfers/execute', TransferHandler.handleTransfer.bind(TransferHandler));
router.post(
  '/transfers/execute-with-credit',
  TransferHandler.confirmTransferWithCredit.bind(TransferHandler)
);

// ============================================================
// AUTHENTICATION ROUTES (Mock)
// ============================================================
router.post('/auth/login', (req, res) => {
  const { usuario_id } = req.body;

  if (!usuario_id) {
    res.status(400).json({
      exito: false,
      error: 'Missing usuario_id',
    });
    return;
  }

  // Mock login - generate token
  const { generateToken } = await import('@/middleware/authMiddleware.js');
  const token = generateToken(usuario_id);

  res.json({
    exito: true,
    token,
    usuario_id,
  });
});

router.post('/auth/register', (req, res) => {
  const { usuario_id } = req.body;

  if (!usuario_id) {
    res.status(400).json({
      exito: false,
      error: 'Missing usuario_id',
    });
    return;
  }

  // Mock register - generate token
  const { generateToken } = await import('@/middleware/authMiddleware.js');
  const token = generateToken(usuario_id);

  res.json({
    exito: true,
    mensaje: 'User registered successfully',
    token,
    usuario_id,
  });
});

export default router;
