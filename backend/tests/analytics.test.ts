import assert from 'node:assert/strict';
import test from 'node:test';
import { comparison, personalRecords, workoutVolume } from '../src/analytics.ts';

test('volume sums weight x repetitions', () => {
  assert.equal(workoutVolume({performedOn:'2026-11-01',durationMinutes:45,sets:[{exerciseId:1,weightKg:50,repetitions:10,durationSeconds:0},{exerciseId:2,weightKg:20,repetitions:8,durationSeconds:0}]}), 660);
});

test('month comparison handles previous year', () => {
  const result = comparison([{performedOn:'2025-12-20',durationMinutes:50,sets:[{exerciseId:1,weightKg:30,repetitions:10,durationSeconds:0}]}], '2026-01');
  assert.equal(result.previous.workouts,1);
  assert.equal(result.previous.volume,300);
  assert.equal(result.current.workouts,0);
});

test('personal records report only increases', () => {
  const workouts = [20,18,25].map((weight,index)=>({performedOn:`2026-11-0${index+1}`,durationMinutes:30,sets:[{exerciseId:5,weightKg:weight,repetitions:8,durationSeconds:0}]}));
  assert.deepEqual(personalRecords(workouts,5).map((record)=>record.weight),[20,25]);
});
