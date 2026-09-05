/**
 * Seed script — creates a demo user in the database.
 * Run: npm run seed
 *
 * Change SEED_EMAIL and SEED_PASSWORD before running in production.
 */

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const prisma = new PrismaClient();

const SEED_EMAIL = process.env['SEED_EMAIL'] ?? 'demo@example.com';
const SEED_PASSWORD = process.env['SEED_PASSWORD'] ?? 'demo1234';

async function main(): Promise<void> {
  console.log('Seeding database...');

  const existingUser = await prisma.user.findUnique({
    where: { email: SEED_EMAIL },
  });

  if (existingUser) {
    console.log(`User already exists: ${SEED_EMAIL}`);
  } else {
    const passwordHash = await bcrypt.hash(SEED_PASSWORD, 12);
    const user = await prisma.user.create({
      data: {
        email: SEED_EMAIL,
        passwordHash,
      },
    });
    console.log(`Created user: ${user.email} (id: ${user.id})`);
  }

  console.log('Seeding complete.');
  console.log(`\nDemo credentials:\n  Email:    ${SEED_EMAIL}\n  Password: ${SEED_PASSWORD}`);
}

main()
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
