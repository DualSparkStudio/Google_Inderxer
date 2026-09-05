import { Router, Request, Response, NextFunction } from 'express';
import { body, validationResult } from 'express-validator';
import { authService } from '../services/auth.service';
import { authLimiter } from '../middleware/rateLimiter';
import { authenticate } from '../middleware/authenticate';

export const authRouter = Router();

// ── POST /api/auth/login ──────────────────────────────────────────────────────
authRouter.post(
  '/login',
  authLimiter,
  [
    body('email').isEmail().normalizeEmail().withMessage('Valid email required.'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters.'),
  ],
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ success: false, errors: errors.array() });
      return;
    }

    try {
      const { email, password } = req.body as { email: string; password: string };
      const result = await authService.login(email, password);

      res.json({
        success: true,
        token: result.token,
        user: result.user,
      });
    } catch (err) {
      next(err);
    }
  },
);

// ── POST /api/auth/logout ─────────────────────────────────────────────────────
// JWT is stateless — logout is handled client-side by discarding the token.
// This endpoint exists so the client can call a proper logout URL and
// we can log the event server-side.
authRouter.post(
  '/logout',
  authenticate,
  (req: Request, res: Response): void => {
    res.json({ success: true, message: 'Logged out successfully.' });
  },
);

// ── GET /api/auth/me ──────────────────────────────────────────────────────────
// Returns current authenticated user info — useful for frontend session restore.
authRouter.get(
  '/me',
  authenticate,
  (req: Request, res: Response): void => {
    res.json({ success: true, user: req.user });
  },
);
