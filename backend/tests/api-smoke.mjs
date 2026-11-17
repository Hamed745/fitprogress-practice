import assert from 'node:assert/strict';

// Run against a local API; modifies and removes ONLY a disposable test workout.
const base=process.env.FITPROGRESS_API_URL||'http://127.0.0.1:3001';
let createdId;
async function req(path,method='GET',body){
  const response=await fetch(`${base}${path}`,{method,headers:body===undefined?{}:{'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
  const data=response.status===204?null:await response.json();
  return {status:response.status,data};
}
try{
  const health=await req('/health');assert.equal(health.status,200);assert.equal(health.data.status,'ok');
  const catalog=await req('/api/exercises');assert.equal(catalog.status,200);assert.ok(catalog.data.length>0,'Exercise catalog must have at least one item');
  const exerciseId=catalog.data[0].id;
  const payload={performedOn:'2026-11-17',sportType:'FitProgress automated smoke',durationMinutes:40,notes:'Disposable smoke test',sets:[{exerciseId,repetitions:10,weightKg:20,durationSeconds:0}]};
  const created=await req('/api/workouts','POST',payload);assert.equal(created.status,201);createdId=created.data.id;
  let workouts=await req('/api/workouts');let entry=workouts.data.find(w=>w.id===createdId);
  assert.equal(entry.sets[0].weightKg,20);assert.equal(entry.sets[0].repetitions,10);
  const invalid=await req(`/api/workouts/${createdId}`,'PUT',{...payload,sets:[{exerciseId,repetitions:10,weightKg:-9,durationSeconds:0}]});
  assert.equal(invalid.status,400);
  workouts=await req('/api/workouts');entry=workouts.data.find(w=>w.id===createdId);
  assert.equal(entry.sets[0].weightKg,20,'Invalid update must keep original');
  const updated=await req(`/api/workouts/${createdId}`,'PUT',{...payload,notes:'Edited by smoke test',sets:[{exerciseId,repetitions:8,weightKg:25,durationSeconds:0}]});
  assert.equal(updated.status,200);
  workouts=await req('/api/workouts');entry=workouts.data.find(w=>w.id===createdId);
  assert.equal(entry.sets.length,1);assert.equal(entry.sets[0].weightKg,25);assert.equal(entry.sets[0].repetitions,8);
  assert.equal(entry.notes,'Edited by smoke test');
  const del=await req(`/api/workouts/${createdId}`,'DELETE');assert.equal(del.status,204);createdId=undefined;
  console.log('PASS: health, catalog, create, invalid update protection, valid edit and deletion');
}catch(err){console.error('FAIL:',err);process.exitCode=1;}
finally{if(createdId){try{await req(`/api/workouts/${createdId}`,'DELETE')}catch(err){console.error('Cleanup failed for test workout',createdId,err)}}}
