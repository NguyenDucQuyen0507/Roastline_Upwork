/** Change notifications pushed to dashboards over Server-Sent Events. */
import type { Request } from 'express';

export const EVENT_TYPES = ['order.created', 'order.updated', 'batch.created', 'batch.cancelled', 'stock.received'] as const;
export type AppEventType = (typeof EVENT_TYPES)[number];

export interface AppEvent {
  type: AppEventType;
  /** Id of the order, batch or coffee that changed. */
  id: string;
  /** One line for people, e.g. "Mara Okafor moved WH-2421 to Roasting". */
  summary: string;
  by: { id: string; name: string };
  /** The X-Client-Id of the browser tab that made the change, so it can skip its own echo. */
  source?: string;
  at: string;
}

export type Listener = (e: AppEvent) => void;

/** Builds an event for the signed-in user who made the request. */
export function eventFor(req: Request, type: AppEventType, id: string, summary: string): AppEvent {
  const user = req.user!;
  const source = req.get('X-Client-Id');
  return {
    type,
    id,
    summary: `${user.name} ${summary}`,
    by: { id: user.id, name: user.name },
    ...(source && /^[\w-]{1,64}$/.test(source) && { source }),
    at: new Date().toISOString(),
  };
}
