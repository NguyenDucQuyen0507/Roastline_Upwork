/** Passwords, access tokens (JWT) and refresh tokens. No Express code in here. */
import { createHash, randomBytes, randomUUID, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { SignJWT, jwtVerify, errors as joseErrors } from 'jose';
import type { Role, User } from './domain.js';

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number, opts: object) => Promise<Buffer>;

export const ACCESS_TOKEN_TTL_SEC = 15 * 60;
export const REFRESH_TOKEN_TTL_SEC = 7 * 24 * 60 * 60;
const ISSUER = 'roastline-api';

/* ---------- passwords (scrypt) ---------- */

const SCRYPT = { N: 16384, r: 8, p: 1 };
const KEY_LEN = 32;

/** Format: scrypt$N$r$p$saltB64$hashB64 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, KEY_LEN, SCRYPT);
  return ['scrypt', SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString('base64'), hash.toString('base64')].join('$');
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [alg, N, r, p, salt, hash] = stored.split('$');
  if (alg !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64');
  const actual = await scrypt(password, Buffer.from(salt, 'base64'), expected.length, { N: +N, r: +r, p: +p });
  return timingSafeEqual(actual, expected);
}

/** Used when the email is unknown, so a login takes the same time either way. */
let dummyHash: Promise<string> | undefined;
export const dummyPasswordHash = () => (dummyHash ??= hashPassword('not-a-real-password'));

/* ---------- access tokens (JWT, HS256) ---------- */

let warned = false;
function secret(): Uint8Array {
  let value = process.env.JWT_SECRET;
  if (!value) {
    if (process.env.NODE_ENV === 'production') throw new Error('JWT_SECRET must be set in production');
    if (!warned && process.env.NODE_ENV !== 'test' && !process.env.VITEST) {
      console.warn('JWT_SECRET is not set; using an insecure development secret.');
      warned = true;
    }
    value = 'roastline-dev-secret-do-not-use-in-production';
  }
  return new TextEncoder().encode(value);
}

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: Role;
}

export const publicUser = (u: User): AuthUser => ({ id: u.id, email: u.email, name: u.name, role: u.role });

export function signAccessToken(user: AuthUser): Promise<string> {
  return new SignJWT({ email: user.email, name: user.name, role: user.role })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.id)
    .setIssuer(ISSUER)
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TOKEN_TTL_SEC}s`)
    .sign(secret());
}

/** The user from a verified access token, plus the token's expiry (seconds since epoch). */
export type TokenUser = AuthUser & { exp: number };
export type VerifyResult = { ok: true; user: TokenUser } | { ok: false; reason: 'expired' | 'invalid' };

export async function verifyAccessToken(token: string): Promise<VerifyResult> {
  try {
    const { payload } = await jwtVerify(token, secret(), { issuer: ISSUER, algorithms: ['HS256'] });
    return {
      ok: true,
      user: {
        id: payload.sub!,
        email: String(payload.email),
        name: String(payload.name),
        role: payload.role as Role,
        exp: payload.exp!,
      },
    };
  } catch (e) {
    return { ok: false, reason: e instanceof joseErrors.JWTExpired ? 'expired' : 'invalid' };
  }
}

/* ---------- refresh tokens (opaque, stored as SHA-256) ---------- */

export const newRefreshToken = () => randomBytes(32).toString('base64url');
export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');
export const newTokenFamily = () => randomUUID();
