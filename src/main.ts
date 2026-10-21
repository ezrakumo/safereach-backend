import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module.js';


async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Swagger UI needs these Helmet checks off, or the docs page is blank.
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
    }),
  );

  app.enableCors({
    origin: true,
    credentials: true,
  });

  app.setGlobalPrefix(process.env.API_PREFIX || 'api/v1');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const config = new DocumentBuilder()
    .setTitle('SafeReach API')
    .setDescription(
      [
        'Personal safety backend.',
        '',
        'How to log in from this page:',
        '1. POST /api/v1/auth/send-otp',
        '2. Copy devOtp from the response (development only)',
        '3. POST /api/v1/auth/verify-otp',
        '4. Click Authorize and paste accessToken. Do not type the word Bearer.',
        '',
        'Public share links do not need a token:',
        'GET /api/v1/public/alerts/{shareToken}',
      ].join('\n'),
    )
    .setVersion('1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Paste the accessToken from verify-otp.',
      },
      'access-token',
    )
    .build();

  const document = SwaggerModule.createDocument(app as any, config);
  document.security = [{ 'access-token': [] }];

  SwaggerModule.setup('docs', app as any, document, {
    swaggerOptions: {
      persistAuthorization: true,
    },
  });
  // API docs for developers
const swaggerConfig = new DocumentBuilder()
  .setTitle('SafeReach API')
  .setDescription('Emergency Safety App Backend')
  .setVersion('1.0')
  .addBearerAuth()
  .build();


  const port = process.env.PORT || 3000;
  await app.listen(port);

  console.log(`Server running on http://localhost:${port}`);
  console.log(`API docs: http://localhost:${port}/docs`);
}

bootstrap();
