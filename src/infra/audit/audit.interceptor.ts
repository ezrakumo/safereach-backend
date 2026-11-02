import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Observable, throwError } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';
import { AuditService } from './audit.service.js';

const SENSITIVE_KEYS = new Set([
  'code', 'password', 'accessToken', 'refreshToken', 'fcmToken', 'confirmPhone',
]);

// Map "METHOD /prefix/segment/..." to a readable action + entity
function describe(method: string, path: string): { action: string; entity: string; entityId?: string } {
  const parts = path.split('?')[0].split('/').filter(Boolean);
  // drop api/v1
  const i = parts.findIndex((p) => p === 'v1');
  const rest = i >= 0 ? parts.slice(i + 1) : parts;
  const [resource, second, third] = rest;
  const uuid = /^[0-9a-f-]{32,36}$/i;

  const entityMap: Record<string, string> = {
    auth: 'User', users: 'User', contacts: 'EmergencyContact', alerts: 'Alert',
    checkins: 'CheckIn', reports: 'Report', admin: 'Admin',
  };
  const entity = entityMap[resource] ?? resource ?? 'Unknown';
  const entityId = uuid.test(second ?? '') ? second : uuid.test(third ?? '') ? third : undefined;

  const verb = uuid.test(second ?? '') ? (third ?? method.toLowerCase()) : (second ?? method.toLowerCase());
  const action = `${(resource ?? 'unknown').toUpperCase()}_${String(verb).toUpperCase().replace(/[^A-Z0-9]/g, '_')}`;
  return { action, entity, entityId };
}

function sanitize(body: unknown): Record<string, unknown> | undefined {
  if (!body || typeof body !== 'object') return undefined;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body as Record<string, unknown>)) {
    if (SENSITIVE_KEYS.has(k)) out[k] = '[redacted]';
    else if (k === 'phoneNumber' && typeof v === 'string') out[k] = v.replace(/(\+?\d{4})\d+(\d{3})$/, '$1***$2');
    else if (typeof v === 'string' && v.length > 200) out[k] = v.slice(0, 200) + '…';
    else out[k] = v;
  }
  return out;
}

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private audit: AuditService) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = ctx.switchToHttp().getRequest<Request & { user?: { id?: string; role?: string } }>();
    const res = ctx.switchToHttp().getResponse<Response>();

    // Only mutating requests are audited
    if (!['POST', 'PATCH', 'PUT', 'DELETE'].includes(req.method)) return next.handle();

    const { action, entity, entityId } = describe(req.method, req.originalUrl ?? req.url);
    const base = {
      actorId: req.user?.id ?? null,
      actorRole: req.user?.role ?? null,
      action,
      entity,
      entityId,
      method: req.method,
      path: (req.originalUrl ?? req.url).split('?')[0],
      ipAddress: req.ip ?? null,
      userAgent: req.headers['user-agent'] ?? null,
      metadata: { body: sanitize(req.body) },
    };

    return next.handle().pipe(
      tap(() => void this.audit.log({ ...base, statusCode: res.statusCode })),
      catchError((err) => {
        const status = typeof err?.getStatus === 'function' ? err.getStatus() : 500;
        void this.audit.log({
          ...base,
          statusCode: status,
          metadata: { ...base.metadata, error: err?.message ?? 'error' },
        });
        return throwError(() => err);
      }),
    );
  }
}
