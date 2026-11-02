import rateLimit, { ipKeyGenerator, type Options } from 'express-rate-limit';
import type { Request } from 'express';
import { createHash } from 'crypto';

function enabled(): boolean {
  return (process.env.RATE_LIMIT_ENABLED ?? 'true').toLowerCase() !== 'false';
}

// Prefer the authenticated user id (from the JWT payload) so a shared office
// IP does not throttle everyone; fall back to IP for anonymous routes.
function userOrIpKey(req: Request): string {
  const auth = req.headers.authorization;
  if (auth?.startsWith('Bearer ')) {
    const token = auth.slice(7);
    try {
      const payload = JSON.parse(
        Buffer.from(token.split('.')[1] ?? '', 'base64url').toString('utf8'),
      );
      if (payload?.sub) return `user:${payload.sub}`;
    } catch {
      /* fall through to IP */
    }
  }
  return `ip:${ipKeyGenerator(req.ip ?? '')}`;
}

// Key by phone number so one attacker can't spam one victim from many IPs.
function phoneKey(req: Request): string {
  const raw = String((req.body as { phoneNumber?: string })?.phoneNumber ?? '').replace(/[\s-]/g, '');
  const hash = createHash('sha256').update(raw).digest('hex').slice(0, 16);
  return `phone:${hash}`;
}

function make(opts: Partial<Options> & { windowMs: number; limit: number; message: string }) {
  return rateLimit({
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skip: () => !enabled(),
    handler: (_req, res) => {
      res.status(429).json({
        statusCode: 429,
        error: 'Too Many Requests',
        message: opts.message,
      });
    },
    ...opts,
  });
}

const MIN = 60 * 1000;

export const globalLimiter = make({
  windowMs: 15 * MIN,
  limit: 300,
  message: 'Too many requests. Please slow down.',
  skip: (req) => !enabled() || req.path.endsWith('/health'),
});

export const sendOtpIpLimiter = make({
  windowMs: 15 * MIN,
  limit: 5,
  message: 'Too many OTP requests from this device. Try again in 15 minutes.',
});

export const sendOtpPhoneLimiter = make({
  windowMs: 15 * MIN,
  limit: 5,
  keyGenerator: phoneKey,
  message: 'Too many OTP requests for this number. Try again in 15 minutes.',
});

export const verifyOtpLimiter = make({
  windowMs: 15 * MIN,
  limit: 10,
  message: 'Too many verification attempts. Request a new code in 15 minutes.',
});

export const refreshLimiter = make({
  windowMs: 15 * MIN,
  limit: 30,
  message: 'Too many token refreshes.',
});

export const sosLimiter = make({
  windowMs: 1 * MIN,
  limit: 5,
  keyGenerator: userOrIpKey,
  message: 'Too many SOS requests. If this is an emergency, call 112.',
});

export const reportCreateLimiter = make({
  windowMs: 60 * MIN,
  limit: 10,
  keyGenerator: userOrIpKey,
  message: 'Report limit reached. You can submit more in an hour.',
});

export const reportVoteLimiter = make({
  windowMs: 60 * MIN,
  limit: 30,
  keyGenerator: userOrIpKey,
  message: 'Too many verify/flag actions. Try again later.',
});

export const publicAlertLimiter = make({
  windowMs: 1 * MIN,
  limit: 60,
  message: 'Too many requests.',
});
