export type AnalyticsSet = {
  exerciseId: number;
  weightKg: number;
  repetitions: number;
  durationSeconds: number;
  muscleGroup?: string;
};
export type AnalyticsWorkout = {
  performedOn: string;
  durationMinutes: number;
  sets: AnalyticsSet[];
};

export const loadForSet = (set: AnalyticsSet) => set.weightKg * set.repetitions;
export const workoutVolume = (workout: AnalyticsWorkout) => workout.sets.reduce((total, set) => total + loadForSet(set), 0);

export function comparison(workouts: AnalyticsWorkout[], currentMonth: string) {
  const [year, month] = currentMonth.split('-').map(Number);
  const previous = new Date(Date.UTC(year, month - 2, 1)).toISOString().slice(0, 7);
  const summarize = (period: string) => {
    const items = workouts.filter((w) => w.performedOn.slice(0, 7) === period);
    return {
      workouts: items.length,
      volume: items.reduce((sum, w) => sum + workoutVolume(w), 0),
      avgDuration: items.length ? Math.round(items.reduce((sum, w) => sum + w.durationMinutes, 0) / items.length) : 0,
    };
  };
  return { current: summarize(currentMonth), previous: summarize(previous) };
}

export function personalRecords(workouts: AnalyticsWorkout[], exerciseId: number) {
  const records = workouts.flatMap((w) => w.sets
    .filter((set) => set.exerciseId === exerciseId && set.weightKg > 0)
    .map((set) => ({ date: w.performedOn, weight: set.weightKg, volume: loadForSet(set) })));
  const sorted = records.sort((a,b) => a.date.localeCompare(b.date));
  let top = 0;
  return sorted.filter((record) => {
    if (record.weight <= top) return false;
    top = record.weight;
    return true;
  });
}
