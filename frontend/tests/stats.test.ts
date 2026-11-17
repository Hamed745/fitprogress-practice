import assert from 'node:assert/strict';
import test from 'node:test';
import { currentAndPrevious, filterWorkoutsByDate, maxSetWeight, personalBest, progress, volume, weeklyMuscles } from '../src/stats.ts';
import type { Workout, Exercise } from '../src/types.ts';

const set=(weight:number,repetitions:number,exerciseId=1)=>({exerciseId,repetitions,weightKg:weight,durationSeconds:0});
const workout=(id:number,date:string,sets= [set(20,10)],minutes=45):Workout=>({id,performedOn:date,sportType:'Test',durationMinutes:minutes,notes:'',sets});
const catalog:Exercise[]=[{id:1,name:'Squats',muscleGroup:'Legs',description:''},{id:2,name:'Run',muscleGroup:'Cardio',description:''}];

test('20 kg x 10 reps is 20 kg actual max weight, not 200 kg',()=>{
  const w=workout(1,'2026-11-17');
  assert.equal(maxSetWeight(w),20);
  assert.equal(volume(w),200);
});
test('monthly maximum and total calculated volume are separate values',()=>{
  const stats=currentAndPrevious([workout(1,'2026-11-17'),workout(2,'2026-10-21',[set(30,5)])],new Date(2026,10,20));
  assert.deepEqual({max:stats.current.maxWeight,vol:stats.current.totalVolume,count:stats.current.count,prevMax:stats.previous.maxWeight}, {max:20,vol:200,count:1,prevMax:30});
});
test('weekly per-muscle graph defaults to a 20 kg actual weight',()=>{
  const bars=weeklyMuscles([workout(1,'2026-11-17')],catalog,new Date(2026,10,17));
  assert.equal(bars[0].weight,20);
  assert.equal(bars[0].volume,200);
});
test('monthly and weekly stats exclude older records',()=>{
  const bars=weeklyMuscles([workout(1,'2026-10-01')],catalog,new Date(2026,10,17));
  assert.equal(bars.length,0);
});
test('journal date filtering is inclusive and reversible',()=>{
  const data=[workout(1,'2026-11-01'),workout(2,'2026-11-17'),workout(3,'2026-12-01')];
  assert.deepEqual(filterWorkoutsByDate(data,'2026-11-17','2026-11-17').map(w=>w.id),[2]);
  assert.equal(filterWorkoutsByDate(data,'','').length,3);
  assert.deepEqual(filterWorkoutsByDate(data,'2026-11-17','').map(w=>w.id),[2,3]);
});
test('personal records use weight instead of repetitions, and progression sorts by day',()=>{
  const data=[workout(1,'2026-11-17',[set(20,10)]),workout(2,'2026-11-20',[set(25,2)])];
  assert.equal(personalBest(data,1)?.weight,25);
  assert.deepEqual(progress(data,1).map(x=>x.maxWeight),[20,25]);
});

import { tr, fmtNumber, fmtDate } from '../src/i18n.ts';
test('RU / EN switch translates analytics, journal controls and unit labels',()=>{
  assert.equal(tr('en','Максимальный вес за месяц'),'Maximum weight this month');
  assert.equal(tr('en','Редактировать тренировку'),'Edit workout');
  assert.equal(tr('en','Объём (кг × повт.)'),'Volume (kg × reps)');
  assert.equal(tr('ru','Редактировать тренировку'),'Редактировать тренировку');
});
test('language number and date formatting are locale-specific',()=>{
  assert.equal(fmtNumber('en',1234.5),'1,234.5');
  assert.equal(fmtNumber('ru',1234.5),'1 234,5');
  assert.ok(fmtDate('en','2026-11-17').includes('Nov'));
});
