// src/index.ts
import 'dotenv/config';
import app from './app';
import { prisma } from './utils/prisma';
import { logger } from './utils/logger';
import fs from 'fs';
import path from 'path';

const PORT = parseInt(process.env.PORT || '3000', 10);

async function main() {
  // Ensure uploads directory exists
  const uploadDir = path.join(process.cwd(), process.env.UPLOAD_DIR || 'uploads');
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  // Verify DB connection
  await prisma.$connect();
  logger.info('Database connected');

  app.listen(PORT, () => {
    logger.info(`GarageOS API running on http://localhost:${PORT}`);
    logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
  });
}

main().catch((err) => {
  logger.error('Failed to start server', err);
  process.exit(1);
});
