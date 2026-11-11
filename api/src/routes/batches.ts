import { Router } from 'express';
import { z } from 'zod';
import {
  COFFEE_IDS,
  ROASTERS,
  ROASTER_CAPACITY_KG,
  fromHHMM,
  greenNeeded,
  overlaps,
  round1,
  toHHMM,
  type Batch,
} from '../domain.js';
import { coffees } from '../seed.js';
import { ApiError, notFound, parse, requireRole } from '../http.js';
import type { Store } from '../store/index.js';

const nameOf = (id: string) => coffees.find((c) => c.id === id)!.name;

export function presentBatch(b: Batch) {
  return {
    id: b.id,
    coffeeId: b.coffeeId,
    coffee: nameOf(b.coffeeId),
    roaster: b.roaster,
    start: toHHMM(b.startMin),
    end: toHHMM(b.startMin + b.durationMin),
    durationMin: b.durationMin,
    kg: b.kg,
    roastLevel: b.roastLevel,
    greenKgUsed: round1(b.greenUse.reduce((s, g) => s + g.kg, 0)),
  };
}

const listQuery = z.object({ roaster: z.enum(ROASTERS).optional() });

const newBatch = z
  .object({
    coffeeId: z.enum(COFFEE_IDS),
    roaster: z.enum(ROASTERS),
    start: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM (24-hour)'),
    durationMin: z.number({ error: 'Enter the roast time in minutes' }).int('Use whole minutes').min(20, 'At least 20 minutes').max(120, 'At most 120 minutes'),
    kg: z.number({ error: 'Enter a weight in kg' }).min(1, 'At least 1 kg'),
    roastLevel: z.number().int().min(1).max(5),
  })
  .refine((b) => fromHHMM(b.start) + b.durationMin <= 24 * 60, {
    message: 'Batch must finish before midnight',
    path: ['durationMin'],
  });

export function batchesRouter(store: Store) {
  const r = Router();

  r.get('/', async (req, res) => {
    const q = parse(listQuery, req.query);
    const rows = (await store.read((t) => t.listBatches()))
      .filter((b) => !q.roaster || b.roaster === q.roaster)
      .map(presentBatch);
    res.json({ data: rows });
  });

  r.post('/', requireRole('admin', 'production'), async (req, res) => {
    const body = parse(newBatch, req.body);
    const startMin = fromHHMM(body.start);

    // 1. The roaster can only hold so much coffee.
    const cap = ROASTER_CAPACITY_KG[body.roaster];
    if (body.kg > cap) {
      throw new ApiError(422, 'ROASTER_CAPACITY_EXCEEDED', `${body.roaster} roasts at most ${cap} kg per batch`, {
        maxKg: cap,
      });
    }

    // Steps 2 and 3 run in one transaction, with the roaster and the stock rows
    // locked, so two requests can't book the same slot or spend the same coffee.
    const batch = await store.tx(async (t) => {
      await t.lockRoaster(body.roaster);

      // 2. One batch at a time per roaster.
      const clash = (await t.listBatches()).find(
        (b) => b.roaster === body.roaster && overlaps(startMin, body.durationMin, b.startMin, b.durationMin),
      );
      if (clash) {
        throw new ApiError(
          409,
          'SCHEDULE_CONFLICT',
          `${body.roaster} is busy from ${toHHMM(clash.startMin)} to ${toHHMM(clash.startMin + clash.durationMin)} (batch ${clash.id})`,
          { conflictingBatchId: clash.id },
        );
      }

      // 3. Enough green coffee for every origin in the recipe. Check all before taking any.
      const greenUse = greenNeeded(body.coffeeId, body.kg);
      const stock = [];
      for (const g of greenUse) {
        const s = (await t.getStock(g.coffeeId, { lock: true }))!;
        if (s.kg < g.kg) {
          throw new ApiError(
            409,
            'INSUFFICIENT_GREEN_STOCK',
            `Needs ${g.kg} kg of green ${nameOf(g.coffeeId)}, only ${s.kg} kg in stock`,
            { coffeeId: g.coffeeId, neededKg: g.kg, availableKg: s.kg },
          );
        }
        stock.push({ s, g });
      }
      for (const { s, g } of stock) await t.setStockKg(s.coffeeId, round1(s.kg - g.kg));

      return t.insertBatch({
        coffeeId: body.coffeeId,
        roaster: body.roaster,
        startMin,
        durationMin: body.durationMin,
        kg: body.kg,
        roastLevel: body.roastLevel as Batch['roastLevel'],
        greenUse,
      });
    });
    res.status(201).location(`/api/v1/batches/${batch.id}`).json(presentBatch(batch));
  });

  r.delete('/:id', requireRole('admin', 'production'), async (req, res) => {
    // Cancelling puts the green coffee back (never beyond storage capacity).
    await store.tx(async (t) => {
      const batch = await t.deleteBatch(String(req.params.id));
      if (!batch) throw notFound(`Batch ${req.params.id}`);
      for (const g of batch.greenUse) {
        const s = (await t.getStock(g.coffeeId, { lock: true }))!;
        await t.setStockKg(s.coffeeId, round1(Math.min(s.capacity, s.kg + g.kg)));
      }
    });
    res.status(204).end();
  });

  return r;
}
