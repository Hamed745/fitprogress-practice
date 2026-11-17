import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { pool, ensureSchema } from './db.js';
import { exerciseSchema, workoutSchema, templateSchema } from './validation.js';
import { allowedOrigin, authProblem, cookieHeader, createSession, findSession, hashPassword, limitLogin, loginSchema, normalizeEmail, parseCookie, registerSchema, resetLoginLimit, sessionHash, verifyPassword } from './auth.js';
import type { PoolClient } from 'pg';

const app = Fastify({ logger: true, bodyLimit: 64 * 1024 });
const allowedOrigins = ['http://localhost:5173', 'http://127.0.0.1:5173', process.env.FRONTEND_ORIGIN].filter(Boolean) as string[];
await app.register(cors, { origin: allowedOrigins, credentials: true });

function inputError(reply: { code: (status: number) => { send: (value: unknown) => unknown } }, errors: unknown) {
  return reply.code(400).send({ error: 'Некорректные данные', details: errors });
}

const workoutQuery = `
 SELECT w.id, to_char(w.performed_on, 'YYYY-MM-DD') AS "performedOn",
        w.sport_type AS "sportType", w.duration_minutes AS "durationMinutes", w.notes,
        COALESCE(json_agg(json_build_object(
            'id', s.id, 'exerciseId', s.exercise_id, 'exerciseName', e.name,
            'muscleGroup', e.muscle_group, 'repetitions', s.repetitions,
            'weightKg', s.weight_kg::float, 'durationSeconds', s.duration_seconds
        ) ORDER BY s.id) FILTER (WHERE s.id IS NOT NULL), '[]'::json) AS sets
 FROM workouts w LEFT JOIN workout_sets s ON s.workout_id = w.id
 LEFT JOIN exercises e ON e.id = s.exercise_id
 WHERE w.owner_id=$1
 GROUP BY w.id ORDER BY w.performed_on DESC, w.id DESC`;

const templateQuery = `
 SELECT t.id, t.name, t.sport_type AS "sportType", t.duration_minutes AS "durationMinutes",
        COALESCE(json_agg(json_build_object(
           'id', s.id, 'exerciseId', s.exercise_id, 'exerciseName', e.name,
           'muscleGroup', e.muscle_group, 'repetitions', s.repetitions,
           'weightKg', s.weight_kg::float, 'durationSeconds', s.duration_seconds
        ) ORDER BY s.id) FILTER (WHERE s.id IS NOT NULL), '[]'::json) AS sets
 FROM templates t LEFT JOIN template_sets s ON s.template_id = t.id
 LEFT JOIN exercises e ON e.id = s.exercise_id
 WHERE t.owner_id=$1
 GROUP BY t.id ORDER BY t.id DESC`;

app.get('/health', async () => ({status:'ok',service:'FitProgress API'}));

// Cookie-session authentication: all user data routes are private.
app.addHook('preHandler', async (request, reply) => {
  if (!['GET','HEAD','OPTIONS'].includes(request.method) && !allowedOrigin(request.headers.origin)) {
    return reply.code(403).send({error:'Недопустимый источник запроса'});
  }
  if (!request.url.startsWith('/api/') || request.url.startsWith('/api/auth/')) return;
  const currentUser = await findSession(request);
  if (!currentUser) return authProblem(reply);
  request.currentUser = currentUser;
});

app.get('/api/auth/me', async (request, reply) => {
  const user = await findSession(request);
  if (!user) return authProblem(reply);
  return user;
});

app.post('/api/auth/register', async (request, reply) => {
  const parsed = registerSchema.safeParse(request.body);
  if (!parsed.success) return inputError(reply, parsed.error.flatten());
  const {name,password} = parsed.data;
  const email = normalizeEmail(parsed.data.email);
  const passwordHash = await hashPassword(password);
  try {
    const {rows} = await pool.query<{id:number,name:string,email:string}>(
      'INSERT INTO users(name,email,password_hash) VALUES ($1,$2,$3) RETURNING id,name,email',
      [name,email,passwordHash]);
    await createSession(rows[0].id,reply);
    return reply.code(201).send(rows[0]);
  } catch (error) {
    if ((error as {code?:string}).code === '23505') return reply.code(409).send({error:'Этот email уже зарегистрирован'});
    throw error;
  }
});

app.post('/api/auth/login', async (request, reply) => {
  const parsed = loginSchema.safeParse(request.body);
  if (!parsed.success) return inputError(reply, parsed.error.flatten());
  if (!limitLogin(request.ip)) return reply.code(429).send({error:'Слишком много попыток входа. Попробуйте позже.'});
  const email = normalizeEmail(parsed.data.email);
  const {rows} = await pool.query<{id:number,name:string,email:string,password_hash:string}>(
    'SELECT id,name,email,password_hash FROM users WHERE email=$1', [email]);
  const user = rows[0];
  // Equal response for unknown email and invalid password. Do not echo user info.
  if (!user || !(await verifyPassword(parsed.data.password,user.password_hash))) {
    return reply.code(401).send({error:'Неверный email или пароль'});
  }
  await createSession(user.id,reply);
  resetLoginLimit(request.ip);
  return {id:user.id,name:user.name,email:user.email};
});

app.post('/api/auth/logout', async (request, reply) => {
  const token = parseCookie(request.headers.cookie);
  if (token) await pool.query('DELETE FROM auth_sessions WHERE token_hash=$1',[sessionHash(token)]);
  reply.header('Set-Cookie', cookieHeader('',0));
  return {ok:true};
});

const ownerId = (request: { currentUser?: {id:number} }) => request.currentUser!.id;
async function checkExercises(client:PoolClient, owner:number, sets:Array<{exerciseId:number}>):Promise<boolean>{
  const ids = [...new Set(sets.map(s=>s.exerciseId))];
  const {rows} = await client.query<{id:number}>(
    'SELECT id FROM exercises WHERE id=ANY($1::int[]) AND (is_public=TRUE OR owner_id=$2)',[ids,owner]);
  return rows.length === ids.length;
}
async function insertSets(client: PoolClient, table: 'workout_sets' | 'template_sets', foreignKey: 'workout_id' | 'template_id', id: number, sets: Array<{exerciseId:number; repetitions:number; weightKg:number; durationSeconds:number}>) {
  for (const set of sets) {
    await client.query(`INSERT INTO ${table} (${foreignKey},exercise_id,repetitions,weight_kg,duration_seconds)
      VALUES ($1,$2,$3,$4,$5)`, [id,set.exerciseId,set.repetitions,set.weightKg,set.durationSeconds]);
  }
}

app.get('/api/exercises', async request => {
  const {rows} = await pool.query(`SELECT id, name, muscle_group AS "muscleGroup", description
    FROM exercises WHERE is_public=TRUE OR owner_id=$1 ORDER BY name COLLATE "default"`,[ownerId(request)]);
  return rows;
});

app.post('/api/exercises', async (request, reply) => {
  const parsed=exerciseSchema.safeParse(request.body);
  if (!parsed.success) return inputError(reply,parsed.error.flatten());
  const {name,muscleGroup,description}=parsed.data;
  const {rows}=await pool.query(`INSERT INTO exercises(name,muscle_group,description,owner_id,is_public) VALUES ($1,$2,$3,$4,FALSE)
    RETURNING id,name,muscle_group AS "muscleGroup",description`,[name,muscleGroup,description,ownerId(request)]);
  return reply.code(201).send(rows[0]);
});

app.get('/api/workouts',async request=>(await pool.query(workoutQuery,[ownerId(request)])).rows);

app.post('/api/workouts',async (request,reply)=>{
  const parsed=workoutSchema.safeParse(request.body);
  if(!parsed.success)return inputError(reply,parsed.error.flatten());
  const {performedOn,sportType,durationMinutes,notes,sets}=parsed.data;
  const client=await pool.connect();
  try{
    await client.query('BEGIN');
    if (!(await checkExercises(client,ownerId(request),sets))) {
      await client.query('ROLLBACK');return reply.code(400).send({error:'Недоступное упражнение'});
    }
    const {rows}=await client.query<{id:number}>(`INSERT INTO workouts (performed_on,sport_type,duration_minutes,notes,owner_id)
      VALUES ($1,$2,$3,$4,$5) RETURNING id`,[performedOn,sportType,durationMinutes,notes,ownerId(request)]);
    await insertSets(client,'workout_sets','workout_id',rows[0].id,sets);
    await client.query('COMMIT');return reply.code(201).send({id:rows[0].id});
  }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
});

app.put<{Params:{id:string}}>('/api/workouts/:id',async (request,reply)=>{
  const id=Number(request.params.id);
  if(!Number.isSafeInteger(id)||id<1)return inputError(reply,'Invalid workout ID');
  const parsed=workoutSchema.safeParse(request.body);
  if(!parsed.success)return inputError(reply,parsed.error.flatten());
  const {performedOn,sportType,durationMinutes,notes,sets}=parsed.data;
  const client=await pool.connect();
  try{
    await client.query('BEGIN');
    const existing=await client.query('SELECT id FROM workouts WHERE id=$1 AND owner_id=$2 FOR UPDATE',[id,ownerId(request)]);
    if(!existing.rowCount){await client.query('ROLLBACK');return reply.code(404).send({error:'Тренировка не найдена'});}
    if(!(await checkExercises(client,ownerId(request),sets))){await client.query('ROLLBACK');return reply.code(400).send({error:'Недоступное упражнение'});}
    await client.query('UPDATE workouts SET performed_on=$1,sport_type=$2,duration_minutes=$3,notes=$4 WHERE id=$5 AND owner_id=$6',
      [performedOn,sportType,durationMinutes,notes,id,ownerId(request)]);
    await client.query('DELETE FROM workout_sets WHERE workout_id=$1',[id]);
    await insertSets(client,'workout_sets','workout_id',id,sets);
    await client.query('COMMIT');return reply.send({id});
  }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
});

app.delete<{Params:{id:string}}>('/api/workouts/:id',async (request,reply)=>{
  const id=Number(request.params.id);
  if(!Number.isSafeInteger(id)||id<1)return inputError(reply,'Invalid workout ID');
  const result=await pool.query('DELETE FROM workouts WHERE id=$1 AND owner_id=$2',[id,ownerId(request)]);
  if(!result.rowCount)return reply.code(404).send({error:'Тренировка не найдена'});
  return reply.code(204).send();
});

app.get('/api/templates',async request=>(await pool.query(templateQuery,[ownerId(request)])).rows);

app.post('/api/templates',async (request,reply)=>{
  const parsed=templateSchema.safeParse(request.body);
  if(!parsed.success)return inputError(reply,parsed.error.flatten());
  const {name,sportType,durationMinutes,sets}=parsed.data;
  const client=await pool.connect();
  try{
    await client.query('BEGIN');
    if(!(await checkExercises(client,ownerId(request),sets))){await client.query('ROLLBACK');return reply.code(400).send({error:'Недоступное упражнение'});}
    const {rows}=await client.query<{id:number}>(`INSERT INTO templates(name,sport_type,duration_minutes,owner_id)
      VALUES ($1,$2,$3,$4) RETURNING id`,[name,sportType,durationMinutes,ownerId(request)]);
    await insertSets(client,'template_sets','template_id',rows[0].id,sets);
    await client.query('COMMIT');return reply.code(201).send({id:rows[0].id});
  }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
});

app.delete<{Params:{id:string}}>('/api/templates/:id',async (request,reply)=>{
  const id=Number(request.params.id);
  if(!Number.isSafeInteger(id)||id<1)return inputError(reply,'Invalid template ID');
  const result=await pool.query('DELETE FROM templates WHERE id=$1 AND owner_id=$2',[id,ownerId(request)]);
  if(!result.rowCount)return reply.code(404).send({error:'Шаблон не найден'});
  return reply.code(204).send();
});

app.setErrorHandler((error,_request,reply)=>{
  app.log.error(error);
  const pgError=error as {code?:string;statusCode?:number;message?:string};
  if(pgError.statusCode && pgError.statusCode>=400 && pgError.statusCode<500)return reply.code(pgError.statusCode).send({error:pgError.message||'Invalid request'});
  if(pgError.code==='23503')return reply.code(400).send({error:'Выбранное упражнение не найдено'});
  return reply.code(500).send({error:'Ошибка сервера. Проверьте журнал API.'});
});

async function main(){await ensureSchema();const port=Number(process.env.PORT||3001);await app.listen({port,host:'127.0.0.1'});}
main().catch(err=>{app.log.error(err);process.exitCode=1;});
