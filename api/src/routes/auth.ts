import { Router } from 'express';
import { z } from 'zod';
import {
  ACCESS_TOKEN_TTL_SEC,
  REFRESH_TOKEN_TTL_SEC,
  dummyPasswordHash,
  hashToken,
  newRefreshToken,
  newTokenFamily,
  publicUser,
  signAccessToken,
  verifyPassword,
  type AuthUser,
} from '../auth.js';
import { ApiError, authenticate, notFound, parse } from '../http.js';
import type { Store, Tx } from '../store/index.js';

const login = z.object({ email: z.email().max(120), password: z.string().min(1).max(200) });
const refresh = z.object({ refreshToken: z.string().min(20).max(200) });

const invalidSession = () => new ApiError(401, 'UNAUTHORIZED', 'Session expired, please sign in again');

/** Issues an access token and a new refresh token in the given family. */
async function issueTokens(t: Tx, user: AuthUser, familyId: string) {
  const refreshToken = newRefreshToken();
  await t.insertRefreshToken({
    userId: user.id,
    familyId,
    tokenHash: hashToken(refreshToken),
    expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_SEC * 1000),
  });
  return {
    accessToken: await signAccessToken(user),
    refreshToken,
    tokenType: 'Bearer',
    expiresIn: ACCESS_TOKEN_TTL_SEC,
    user,
  };
}

export function authRouter(store: Store) {
  const r = Router();

  r.post('/login', async (req, res) => {
    const body = parse(login, req.body);
    const user = await store.read((t) => t.findUserByEmail(body.email));
    // Always run the hash check so unknown emails aren't faster to reject.
    const ok = await verifyPassword(body.password, user?.passwordHash ?? (await dummyPasswordHash()));
    if (!user || !ok) throw new ApiError(401, 'UNAUTHORIZED', 'Wrong email or password');
    res.json(await store.tx((t) => issueTokens(t, publicUser(user), newTokenFamily())));
  });

  /**
   * Rotates the refresh token: the old one is revoked and a new pair is returned.
   * Presenting a token that was already used means it leaked, so the whole
   * family (every token from that sign-in) is revoked.
   */
  r.post('/refresh', async (req, res) => {
    const { refreshToken } = parse(refresh, req.body);
    const outcome = await store.tx(async (t) => {
      const record = await t.findRefreshToken(hashToken(refreshToken), { lock: true });
      if (!record) return { error: invalidSession() };
      if (record.revokedAt) {
        await t.revokeTokenFamily(record.familyId);
        return { error: new ApiError(401, 'UNAUTHORIZED', 'Refresh token was already used; all sessions from that sign-in were ended') };
      }
      if (record.expiresAt.getTime() <= Date.now()) return { error: invalidSession() };
      const user = await t.getUser(record.userId);
      if (!user) return { error: invalidSession() };
      await t.revokeRefreshToken(record.id);
      return { tokens: await issueTokens(t, publicUser(user), record.familyId) };
    });
    // Thrown outside the transaction so the family revocation above is committed.
    if (outcome.error) throw outcome.error;
    res.json(outcome.tokens);
  });

  r.post('/logout', async (req, res) => {
    const { refreshToken } = parse(refresh, req.body);
    await store.tx(async (t) => {
      const record = await t.findRefreshToken(hashToken(refreshToken), { lock: true });
      if (record) await t.revokeTokenFamily(record.familyId);
    });
    res.status(204).end();
  });

  r.get('/me', authenticate, async (req, res) => {
    const user = await store.read((t) => t.getUser(req.user!.id));
    if (!user) throw notFound('User');
    res.json(publicUser(user));
  });

  return r;
}
