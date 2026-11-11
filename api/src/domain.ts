/** Domain types and business rules for Roastline. No Express code in here. */

export const COFFEE_IDS = ['guji', 'huila', 'nyeri', 'cerrado', 'huehue', 'house', 'decaf'] as const;
export type CoffeeId = (typeof COFFEE_IDS)[number];

export const GRINDS = ['Whole bean', 'Espresso', 'Filter'] as const;
export type Grind = (typeof GRINDS)[number];

export const ORDER_STATUSES = ['New', 'Roasting', 'Packed', 'Shipped'] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const ROASTERS = ['Probat P12', 'Loring S15'] as const;

export const ROLES = ['admin', 'production', 'viewer'] as const;
export type Role = (typeof ROLES)[number];

/**
 * Prices, order values and revenue. The roasting floor (production) works
 * without them; admin and viewer (e.g. accounts) see them.
 */
export const FINANCIAL_ROLES: readonly Role[] = ['admin', 'viewer'];
export const seesFinancials = (role: Role | undefined) => !!role && FINANCIAL_ROLES.includes(role);

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  passwordHash: string;
}

export interface RefreshTokenRecord {
  id: string;
  userId: string;
  /** All tokens issued from one login share a family; reuse of an old one revokes the family. */
  familyId: string;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
}
export type Roaster = (typeof ROASTERS)[number];

export interface Coffee {
  id: CoffeeId;
  name: string;
  origin: string;
  pricePerKg: number;
  isBlend: boolean;
}

export interface OrderLine {
  coffeeId: CoffeeId;
  kg: number;
  grind: Grind;
}

export interface Order {
  id: string;
  customer: string;
  city: string;
  lines: OrderLine[];
  due: string; // YYYY-MM-DD
  status: OrderStatus;
  note?: string;
}

export interface GreenUse {
  coffeeId: CoffeeId;
  kg: number;
}

export interface Batch {
  id: string;
  coffeeId: CoffeeId;
  roaster: Roaster;
  startMin: number; // minutes from midnight
  durationMin: number;
  kg: number; // roasted weight
  roastLevel: 1 | 2 | 3 | 4 | 5;
  greenUse: GreenUse[];
}

export interface StockRecord {
  coffeeId: CoffeeId;
  kg: number;
  reorderAt: number;
  capacity: number;
}

/** The demo runs on a fixed "today" so the seed data stays meaningful. */
export const TODAY = '2026-11-05';

/** Roasting loses roughly 15% of the green coffee's weight. */
export const ROAST_YIELD = 0.85;

export const ROASTER_CAPACITY_KG: Record<Roaster, number> = {
  'Probat P12': 12,
  'Loring S15': 15,
};

/** Blends are roasted from single origins in these proportions. */
export const RECIPES: Partial<Record<CoffeeId, Partial<Record<CoffeeId, number>>>> = {
  house: { cerrado: 0.6, huila: 0.4 },
};

export const round1 = (n: number) => Math.round(n * 10) / 10;
export const round2 = (n: number) => Math.round(n * 100) / 100;

export function nextStatus(status: OrderStatus): OrderStatus | null {
  const i = ORDER_STATUSES.indexOf(status);
  return ORDER_STATUSES[i + 1] ?? null;
}

/** Green coffee needed to roast `kg` of a coffee, split by origin for blends. */
export function greenNeeded(coffeeId: CoffeeId, kg: number): GreenUse[] {
  const green = kg / ROAST_YIELD;
  const recipe = RECIPES[coffeeId] ?? { [coffeeId]: 1 };
  return Object.entries(recipe).map(([id, share]) => ({
    coffeeId: id as CoffeeId,
    kg: round1(green * (share ?? 0)),
  }));
}

export function stockLevel(s: StockRecord): 'ok' | 'low' | 'critical' {
  if (s.kg <= s.reorderAt / 2) return 'critical';
  if (s.kg <= s.reorderAt) return 'low';
  return 'ok';
}

export const toHHMM = (min: number) =>
  `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

export const fromHHMM = (s: string) => {
  const [h, m] = s.split(':').map(Number);
  return h * 60 + m;
};

export const overlaps = (aStart: number, aDur: number, bStart: number, bDur: number) =>
  aStart < bStart + bDur && bStart < aStart + aDur;
