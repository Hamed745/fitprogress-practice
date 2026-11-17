import assert from 'node:assert/strict';
import pg from 'pg';

// Use disposable PostgreSQL (CI runs Docker Compose). Creates two temporary accounts and cleans them up.
const base=process.env.FITPROGRESS_API_URL||'http://127.0.0.1:3001';
const suffix=`${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2,7)}`;
const aEmail=`test-a-${suffix}@example.org`;
const bEmail=`test-b-${suffix}@example.org`;
const passA='This is a test password A!';
const passB='This is a test password B!';
let idA,idB,ownerWorkout,ownerTemplate,privateExercise;
async function req(path,method='GET',body,session='',origin){
  const headers={...(body===undefined?{}:{'Content-Type':'application/json'}),...(session?{Cookie:session}:{}),...(origin?{Origin:origin}:{})};
  const response=await fetch(`${base}${path}`,{method,headers,...(body===undefined?{}:{body:JSON.stringify(body)})});
  const data=response.status===204?null:await response.json();
  return {status:response.status,data,cookie:response.headers.get('set-cookie')?.split(';')[0]||''};
}
const payload=(exerciseId)=>({performedOn:'2026-11-17',sportType:'FitProgress isolation test',durationMinutes:30,notes:'Disposable',sets:[{exerciseId,repetitions:10,weightKg:20,durationSeconds:0}]});
try {
  assert.equal((await req('/health')).status,200);
  assert.equal((await req('/api/workouts')).status,401,'Anonymous workout listing must be denied');
  assert.equal((await req('/api/templates')).status,401,'Anonymous templates must be denied');
  assert.equal((await req('/api/exercises')).status,401,'Anonymous exercise listing must be denied');

  let reg=await req('/api/auth/register','POST',{name:'Test Alice',email:aEmail.toUpperCase(),password:passA});
  assert.equal(reg.status,201,'Register user A');idA=reg.data.id;
  const aCookie=reg.cookie;
  assert.match(aCookie,/fitprogress_session=/);
  assert.equal((await req('/api/auth/me','GET',undefined,aCookie)).data.email,aEmail);
  assert.equal((await req('/api/auth/register','POST',{name:'Test Alice',email:aEmail,password:passA})).status,409,'Duplicate email should be rejected');

  reg=await req('/api/auth/register','POST',{name:'Test Bob',email:bEmail,password:passB});
  assert.equal(reg.status,201,'Register user B');idB=reg.data.id;
  const bCookie=reg.cookie;
  assert.equal((await req('/api/workouts','GET',undefined,bCookie)).data.length,0);
  const catalog=await req('/api/exercises','GET',undefined,aCookie);
  assert.ok(catalog.data.length>0);
  const sharedId=catalog.data[0].id;

  const privateResult=await req('/api/exercises','POST',{name:'Alice private test '+suffix,muscleGroup:'Ноги',description:'Personal'},aCookie);
  assert.equal(privateResult.status,201);privateExercise=privateResult.data.id;
  const bobExercises=await req('/api/exercises','GET',undefined,bCookie);
  assert.ok(!bobExercises.data.some(e=>e.id===privateExercise),'B must not see A exercise');

  let created=await req('/api/workouts','POST',payload(privateExercise),aCookie);
  assert.equal(created.status,201);ownerWorkout=created.data.id;
  assert.equal((await req('/api/workouts','GET',undefined,bCookie)).data.length,0,'B must not list A workouts');
  assert.equal((await req(`/api/workouts/${ownerWorkout}`,'PUT',payload(sharedId),bCookie)).status,404,'B must not edit A workout');
  assert.equal((await req(`/api/workouts/${ownerWorkout}`,'DELETE',undefined,bCookie)).status,404,'B must not delete A workout');
  assert.equal((await req('/api/workouts','POST',payload(privateExercise),bCookie)).status,400,'B must not use A private exercise');
  assert.equal((await req('/api/workouts','POST',payload(sharedId),aCookie,'https://evil.example')).status,403,'Cross-site POST must be denied');

  const updated={...payload(privateExercise),sets:[{exerciseId:privateExercise,repetitions:8,weightKg:25,durationSeconds:0}]};
  assert.equal((await req(`/api/workouts/${ownerWorkout}`,'PUT',updated,aCookie)).status,200);
  const entriesA=await req('/api/workouts','GET',undefined,aCookie);
  const updatedEntry=entriesA.data.find(w=>w.id===ownerWorkout);
  assert.equal(updatedEntry.sets[0].weightKg,25);

  created=await req('/api/templates','POST',{name:'A private template',sportType:'Strength',durationMinutes:45,sets:payload(privateExercise).sets},aCookie);
  assert.equal(created.status,201);ownerTemplate=created.data.id;
  assert.ok(!(await req('/api/templates','GET',undefined,bCookie)).data.some(t=>t.id===ownerTemplate),'B must not list A templates');
  assert.equal((await req(`/api/templates/${ownerTemplate}`,'DELETE',undefined,bCookie)).status,404,'B must not delete A templates');

  assert.equal((await req('/api/auth/login','POST',{email:aEmail,password:'incorrect password'})).status,401);
  const reLogin=await req('/api/auth/login','POST',{email:aEmail.toUpperCase(),password:passA});
  assert.equal(reLogin.status,200);
  assert.equal((await req('/api/workouts','GET',undefined,reLogin.cookie)).data.length,1,'Login restores owned data');
  assert.equal((await req('/api/auth/logout','POST',undefined,reLogin.cookie)).status,200);
  assert.equal((await req('/api/auth/me','GET',undefined,reLogin.cookie)).status,401,'Logout revokes session');
  assert.equal((await req('/api/workouts','GET',undefined,aCookie)).data.length,1,'Logging out one session does not revoke others');

  console.log('PASS: anonymous access denied, register/login/logout, private exercises, workout/template ownership, edit restrictions, CSRF, session persistence');
}catch(error){console.error('FAIL:',error);process.exitCode=1;}
finally{
  const db = new pg.Client({connectionString:process.env.DATABASE_URL||'postgresql://fitprogress:fitprogress_local@localhost:5433/fitprogress'});
  try{
    await db.connect();
    const ids=[idA,idB].filter(Number.isInteger);
    if(ids.length){
      await db.query('BEGIN');
      await db.query('DELETE FROM workouts WHERE owner_id=ANY($1::int[])',[ids]);
      await db.query('DELETE FROM templates WHERE owner_id=ANY($1::int[])',[ids]);
      await db.query('DELETE FROM exercises WHERE owner_id=ANY($1::int[])',[ids]);
      await db.query('DELETE FROM users WHERE id=ANY($1::int[])',[ids]);
      await db.query('COMMIT');
    }
  }catch(error){await db.query('ROLLBACK').catch(()=>{});console.error('Test cleanup issue:',error);process.exitCode=1;}
  finally{await db.end().catch(()=>{});}
}
