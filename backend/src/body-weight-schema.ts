import { z } from 'zod';

// Standalone validation module (no database imports) to keep unit tests isolated.
export const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((date) => {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
}, 'Invalid calendar date');

export const bodyWeightSchema = z.object({
  measuredOn: dateSchema,
  weightKg: z.number().finite().positive().max(1000),
  note: z.string().max(300).default(''),
});
