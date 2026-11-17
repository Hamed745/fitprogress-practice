import assert from 'node:assert/strict';
import test from 'node:test';
import { bodyWeightSchema, dateSchema } from '../src/body-weight-schema.ts';

test('valid calendar dates including leap day',()=>{
  assert.equal(dateSchema.safeParse('2024-02-29').success,true);
  for(const value of ['2026-02-29','2026-13-01','2026-00-01','2026-11-31','2026-1-7'])
    assert.equal(dateSchema.safeParse(value).success,false,value);
});
test('body weight form validation is strict and allows private notes',()=>{
  assert.equal(bodyWeightSchema.safeParse({measuredOn:'2026-11-17',weightKg:70.5,note:'personal'}).success,true);
  assert.equal(bodyWeightSchema.safeParse({measuredOn:'2026-11-17',weightKg:70.5}).success,true);
  for (const value of [0,-1,1001,NaN,Infinity,'70'])
    assert.equal(bodyWeightSchema.safeParse({measuredOn:'2026-11-17',weightKg:value}).success,false,String(value));
  assert.equal(bodyWeightSchema.safeParse({measuredOn:'2026-11-17',weightKg:70,note:'n'.repeat(301)}).success,false);
});
