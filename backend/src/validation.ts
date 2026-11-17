import { z } from 'zod';

export const setSchema = z.object({
  exerciseId: z.number().int().positive(),
  repetitions: z.number().int().min(0).max(100000),
  weightKg: z.number().min(0).max(100000),
  durationSeconds: z.number().int().min(0).max(86400),
}).refine((set) => set.repetitions > 0 || set.durationSeconds > 0, 'Укажите повторения или время');

export const workoutSchema = z.object({
  performedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  sportType: z.string().trim().min(1).max(90),
  durationMinutes: z.number().int().min(0).max(1440),
  notes: z.string().max(2000),
  sets: z.array(setSchema).min(1).max(100),
});

export const templateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  sportType: z.string().trim().min(1).max(90),
  durationMinutes: z.number().int().min(0).max(1440),
  sets: z.array(setSchema).min(1).max(100),
});

export const exerciseSchema = z.object({
  name: z.string().trim().min(2).max(120),
  muscleGroup: z.string().trim().min(2).max(60),
  description: z.string().max(1000).default(''),
});
