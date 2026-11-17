import type { Exercise, Workout, ExerciseSet } from './types';
export const setVolume=(s:ExerciseSet)=>s.weightKg*s.repetitions;
export const volume=(w:Workout)=>w.sets.reduce((n,s)=>n+setVolume(s),0);
/** Actual weight recorded for one repetition, not cumulative training volume. */
export const maxSetWeight=(w:Workout)=>w.sets.reduce((max,s)=>Math.max(max,s.weightKg),0);
export const number=(n:number)=>new Intl.NumberFormat('ru-RU',{maximumFractionDigits:1}).format(n);
export const prettyDate=(s:string)=>new Date(`${s}T12:00:00`).toLocaleDateString('ru-RU',{day:'numeric',month:'short'});
export const monthLabel=(date:Date)=>date.toLocaleDateString('ru-RU',{month:'long',year:'numeric'});
export function currentAndPrevious(workouts:Workout[]) {
  const now=new Date(); const current=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  const prev=new Date(now.getFullYear(),now.getMonth()-1,1);
  const previous=`${prev.getFullYear()}-${String(prev.getMonth()+1).padStart(2,'0')}`;
  const calc=(period:string)=>{
    const list=workouts.filter(w=>w.performedOn.startsWith(period));
    return {count:list.length,totalVolume:list.reduce((n,w)=>n+volume(w),0),averageMinutes:list.length?Math.round(list.reduce((n,w)=>n+w.durationMinutes,0)/list.length):0};
  };
  return {current:calc(current),previous:calc(previous)};
}
export function weeklyMuscles(workouts:Workout[], exercises:Exercise[]) {
  const since=new Date();since.setDate(since.getDate()-7);since.setHours(0,0,0,0);
  const map=new Map(exercises.map(e=>[e.id,e.muscleGroup]));
  const group=new Map<string,number>();
  workouts.filter(w=>new Date(`${w.performedOn}T12:00:00`)>=since).forEach(w=>w.sets.forEach(s=>{
    const name=map.get(s.exerciseId)||'Другое';group.set(name,(group.get(name)||0)+setVolume(s));
  }));
  return Array.from(group.entries()).map(([name,weight])=>({name,weight})).sort((a,b)=>b.weight-a.weight);
}
export function progress(workouts:Workout[], exerciseId:number) {
  const perDay=new Map<string,{maxWeight:number;volume:number}>();
  workouts.forEach(w=>w.sets.filter(s=>s.exerciseId===exerciseId).forEach(s=>{
    const prev=perDay.get(w.performedOn)||{maxWeight:0,volume:0};
    perDay.set(w.performedOn,{maxWeight:Math.max(prev.maxWeight,s.weightKg),volume:prev.volume+setVolume(s)});
  }));
  return Array.from(perDay.entries()).sort(([a],[b])=>a.localeCompare(b)).map(([date,data])=>({date:prettyDate(date),rawDate:date,...data}));
}
export function personalBest(workouts:Workout[],exerciseId:number) {
  return workouts.flatMap(w=>w.sets.filter(s=>s.exerciseId===exerciseId).map(s=>({date:w.performedOn,weight:s.weightKg}))).sort((a,b)=>b.weight-a.weight)[0];
}
