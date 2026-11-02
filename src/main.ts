import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { json, urlencoded } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { AppModule } from './app.module.js';
import {
  globalLimiter,
  sendOtpIpLimiter,
  sendOtpPhoneLimiter,
  verifyOtpLimiter,
  refreshLimiter,
  sosLimiter,
  reportCreateLimiter,
  reportVoteLimiter,
  publicAlertLimiter,
} from './common/middleware/rate-limit.js';

function parseCorsOrigins(value?: string): boolean | string[] {
  if (!value || value.trim() === '' || value.trim() === '*') return true;
  return value.split(',').map((o) => o.trim()).filter(Boolean);
}

function reportsLimiter(req: Request, res: Response, next: NextFunction) {
  if (req.method === 'POST' && /\/(verify|flag)$/.test(req.path)) {
    return reportVoteLimiter(req, res, next);
  }
  if (req.method === 'POST' && (req.path === '/' || req.path === '')) {
    return reportCreateLimiter(req, res, next);
  }
  return next();
}

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });

  // Render/any proxy: makes req.ip the real client, not the load balancer
  app.set('trust proxy', 1);

  const maxBodySize = process.env.MAX_BODY_SIZE || '1mb';
  app.use(json({ limit: maxBodySize }));
  app.use(urlencoded({ extended: true, limit: maxBodySize }));

  app.use(
    helmet({
      contentSecurityPolicy: process.env.ENABLE_SWAGGER === 'true' ? false : undefined,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );

  app.enableCors({ origin: parseCorsOrigins(process.env.CORS_ORIGINS), credentials: true });

  const prefix = (process.env.API_PREFIX || 'api/v1').replace(/^\/+|\/+$/g, '');
  app.setGlobalPrefix(prefix);

  // Rate limits: specific routes first, global last
  const p = '/' + prefix;
  app.use(p + '/auth/send-otp', sendOtpIpLimiter, sendOtpPhoneLimiter);
  app.use(p + '/auth/verify-otp', verifyOtpLimiter);
  app.use(p + '/auth/refresh', refreshLimiter);
  app.use(p + '/alerts/sos', sosLimiter);
  app.use(p + '/public/alerts', publicAlertLimiter);
  app.use(p + '/reports', reportsLimiter);
  app.use(globalLimiter);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  if (process.env.ENABLE_SWAGGER !== 'false') {
    const cfg = new DocumentBuilder()
      .setTitle('SafeReach API')
      .setDescription('Personal safety backend: auth, SOS, tracking, check-ins, and danger reports.')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const doc = SwaggerModule.createDocument(app as any, cfg);
    SwaggerModule.setup('docs', app as any, doc, { swaggerOptions: { persistAuthorization: true } });
    logger.log('Swagger enabled at /docs');
  }

  const port = Number(process.env.PORT) || 3000;
  await app.listen(port, '0.0.0.0');
  logger.log('Server running on port ' + port);
  logger.log(
    'Rate limiting: ' + ((process.env.RATE_LIMIT_ENABLED ?? 'true') !== 'false' ? 'ON' : 'OFF'),
  );
}

bootstrap();
