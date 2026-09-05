import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../config/prisma';
import { config } from '../config';
import { AppError } from '../middleware/errorHandler';
import { logger } from '../config/logger';

export interface LoginResult {
  token: string;
  user: {
    id: string;
    email: string;
  };
}

export const authService = {
  async login(email: string, password: string): Promise<LoginResult> {
    const normalizedEmail = email.trim().toLowerCase();

    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (!user) {
      // Timing-safe: still run bcrypt compare to prevent user enumeration
      await bcrypt.compare(password, '$2b$12$invalidhashfortimingsafety00000000000000000');
      throw new AppError(401, 'Invalid email or password.');
    }

    const passwordMatch = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatch) {
      logger.warn('Failed login attempt', { email: normalizedEmail });
      throw new AppError(401, 'Invalid email or password.');
    }

    const payload = { userId: user.id, email: user.email };
    const token = jwt.sign(payload, config.jwt.secret, {
      expiresIn: config.jwt.expiresIn as string,
    });

    logger.info('User logged in', { userId: user.id });

    return {
      token,
      user: { id: user.id, email: user.email },
    };
  },

  async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, 12);
  },
};
