import type { ErrorRequestHandler, RequestHandler } from 'express';
import { z } from 'zod';
import { verifyAccessToken, type AuthUser } from './auth.js';
import type { Role } from './domain.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Set by `authenticate` for signed-in requests. */
      user?: AuthUser;
    }
  }
}

export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'INVALID_TRANSITION'
  | 'ORDER_LOCKED'
  | 'SCHEDULE_CONFLICT'
  | 'ROASTER_CAPACITY_EXCEEDED'
  | 'INSUFFICIENT_GREEN_STOCK'
  | 'STORAGE_CAPACITY_EXCEEDED'
  | 'INTERNAL_ERROR';

/** Thrown anywhere in a route; the error handler turns it into the standard JSON shape. */
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: ErrorCode,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export const notFound = (what: string) => new ApiError(404, 'NOT_FOUND', `${what} not found`);

/** Parse and validate with a Zod schema, or throw a 400 with field-level details. */
export function parse<T extends z.ZodType>(schema: T, input: unknown): z.infer<T> {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new ApiError(
      400,
      'VALIDATION_ERROR',
      'Request validation failed',
      result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    );
  }
  return result.data;
}

/** Requires `Authorization: Bearer <access token>` and puts the user on `req.user`. */
export const authenticate: RequestHandler = async (req, _res, next) => {
  const [scheme, token] = (req.get('Authorization') ?? '').split(' ');
  if (scheme !== 'Bearer' || !token) {
    return next(new ApiError(401, 'UNAUTHORIZED', 'Sign in first: send Authorization: Bearer <access token>'));
  }
  const result = await verifyAccessToken(token);
  if (!result.ok) {
    return next(
      new ApiError(401, 'UNAUTHORIZED', result.reason === 'expired' ? 'Access token expired' : 'Invalid access token', {
        reason: result.reason,
      }),
    );
  }
  req.user = result.user;
  next();
};

/** Allows the request only for the given roles. Use after `authenticate`. */
export const requireRole =
  (...roles: Role[]): RequestHandler =>
  (req, _res, next) => {
    const role = req.user?.role;
    if (!role || !roles.includes(role)) {
      return next(
        new ApiError(403, 'FORBIDDEN', `This action needs one of these roles: ${roles.join(', ')}`, {
          requiredRoles: roles,
          role: role ?? null,
        }),
      );
    }
    next();
  };

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ApiError) {
    res.status(err.status).json({
      error: { code: err.code, message: err.message, ...(err.details !== undefined && { details: err.details }) },
    });
    return;
  }
  // Malformed JSON body
  if (err?.type === 'entity.parse.failed') {
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Request body is not valid JSON' } });
    return;
  }
  console.error(err);
  res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Something went wrong' } });
};
