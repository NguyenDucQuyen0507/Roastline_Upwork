import { Router, type Response } from 'express';
import type { Store } from '../store/index.js';
import type { AppEvent } from '../events.js';

const HEARTBEAT_MS = 25_000;

/** Open streams, so a shutting-down server can end them (they never finish on their own). */
const open = new Set<Response>();

/** Ends every open event stream; clients reconnect, to a new instance during a deploy. */
export function endEventStreams() {
  for (const res of open) res.end();
  open.clear();
}

/**
 * GET /events: a Server-Sent Events stream of committed changes. Needs a
 * signed-in user like every other route. The stream ends when the access
 * token expires, so a client reconnects with a fresh token instead of
 * listening forever on an old one.
 */
export function eventsRouter(store: Store) {
  const r = Router();

  r.get('/', (req, res) => {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no', // ask proxies not to buffer the stream
    });
    res.write('retry: 3000\n: connected\n\n');
    open.add(res);

    const send = (e: AppEvent) => res.write(`id: ${e.at}\nevent: change\ndata: ${JSON.stringify(e)}\n\n`);
    const unsubscribe = store.subscribe(send);
    // Comments keep idle connections from being closed by proxies and load balancers.
    const heartbeat = setInterval(() => res.write(': ping\n\n'), HEARTBEAT_MS);
    const msLeft = req.user!.exp * 1000 - Date.now();
    const expiry = setTimeout(() => res.end(), Math.max(0, msLeft));

    const stop = () => {
      open.delete(res);
      unsubscribe();
      clearInterval(heartbeat);
      clearTimeout(expiry);
    };
    req.on('close', stop);
    res.on('close', stop);
  });

  return r;
}
