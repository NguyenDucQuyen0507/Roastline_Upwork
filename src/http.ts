import type { ErrorRequestHandler, RequestHandler } from 'express';
import { z } from 'zod';

export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHORIZED'
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

/** Write operations need the X-API-Key header. Reads are public. */
export const requireApiKey: RequestHandler = (req, _res, next) => {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
  const expected = process.env.API_KEY ?? 'demo-key';
  if (req.get('X-API-Key') !== expected) {
    return next(new ApiError(401, 'UNAUTHORIZED', 'A valid X-API-Key header is required'));
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
