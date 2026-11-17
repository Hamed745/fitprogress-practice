import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { pool, ensureSchema } from './db.js';
import { exerciseSchema, workoutSchema, templateSchema } from './validation.js';
import type { PoolClient } from 'pg';

const app = Fastify({ logger: true });
await app.register(cors, { origin: process.env.FRONTEND_ORIGIN || 'http://localhost:5173' });

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
 GROUP BY t.id ORDER BY t.id DESC`;

app.get('/health', async () => ({ status: 'ok', service: 'FitProgress API' }));

app.get('/api/exercises', async () => {
  const { rows } = await pool.query(`SELECT id, name, muscle_group AS "muscleGroup", description FROM exercises ORDER BY name COLLATE "default"`);
  return rows;
});

app.post('/api/exercises', async (request, reply) => {
  const parsed = exerciseSchema.safeParse(request.body);
  if (!parsed.success) return inputError(reply, parsed.error.flatten());
  const { name, muscleGroup, description } = parsed.data;
  const { rows } = await pool.query(`INSERT INTO exercises (name, muscle_group, description) VALUES ($1,$2,$3)
       RETURNING id, name, muscle_group AS "muscleGroup", description`, [name, muscleGroup, description]);
  return reply.code(201).send(rows[0]);
});

app.get('/api/workouts', async () => (await pool.query(workoutQuery)).rows);

async function insertSets(client: PoolClient, table: 'workout_sets' | 'template_sets', foreignKey: 'workout_id' | 'template_id', id: number, sets: Array<{exerciseId:number; repetitions:number; weightKg:number; durationSeconds:number}>) {
  for (const set of sets) {
    await client.query(`INSERT INTO ${table} (${foreignKey},exercise_id,repetitions,weight_kg,duration_seconds)
      VALUES ($1,$2,$3,$4,$5)`, [id,set.exerciseId,set.repetitions,set.weightKg,set.durationSeconds]);
  }
}

app.post('/api/workouts', async (request, reply) => {
  const parsed = workoutSchema.safeParse(request.body);
  if (!parsed.success) return inputError(reply, parsed.error.flatten());
  const { performedOn, sportType, durationMinutes, notes, sets } = parsed.data;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const created = await client.query<{id:number}>(`INSERT INTO workouts (performed_on,sport_type,duration_minutes,notes)
      VALUES ($1,$2,$3,$4) RETURNING id`,[performedOn,sportType,durationMinutes,notes]);
    await insertSets(client,'workout_sets','workout_id',created.rows[0].id,sets);
    await client.query('COMMIT');
    return reply.code(201).send({ id: created.rows[0].id });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
});


/** Update one workout and its sets atomically. */
app.put<{Params:{id:string}}>('/api/workouts/:id', async (request, reply) => {
  const id=Number(request.params.id);
  if(!Number.isSafeInteger(id)||id<1)return inputError(reply,'Invalid workout ID');
  const parsed=workoutSchema.safeParse(request.body);
  if(!parsed.success)return inputError(reply,parsed.error.flatten());
  const {performedOn,sportType,durationMinutes,notes,sets}=parsed.data;
  const client=await pool.connect();
  try{
    await client.query('BEGIN');
    const existing=await client.query('SELECT id FROM workouts WHERE id=$1 FOR UPDATE',[id]);
    if(existing.rowCount===0){await client.query('ROLLBACK');return reply.code(404).send({error:'Тренировка не найдена'});}
    await client.query('UPDATE workouts SET performed_on=$1,sport_type=$2,duration_minutes=$3,notes=$4 WHERE id=$5',[performedOn,sportType,durationMinutes,notes,id]);
    await client.query('DELETE FROM workout_sets WHERE workout_id=$1',[id]);
    await insertSets(client,'workout_sets','workout_id',id,sets);
    await client.query('COMMIT');
    return reply.send({id});
  }catch(error){await client.query('ROLLBACK');throw error;}
  finally{client.release();}
});

app.delete<{Params:{id:string}}>('/api/workouts/:id', async (request, reply) => {
  const id = Number(request.params.id);
  if (!Number.isSafeInteger(id) || id < 1) return inputError(reply,'Invalid workout ID');
  const result = await pool.query('DELETE FROM workouts WHERE id=$1', [id]);
  if (result.rowCount === 0) return reply.code(404).send({error:'Тренировка не найдена'});
  return reply.code(204).send();
});

app.get('/api/templates', async () => (await pool.query(templateQuery)).rows);

app.post('/api/templates', async (request, reply) => {
  const parsed = templateSchema.safeParse(request.body);
  if (!parsed.success) return inputError(reply, parsed.error.flatten());
  const { name, sportType, durationMinutes, sets } = parsed.data;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const created = await client.query<{id:number}>(`INSERT INTO templates (name,sport_type,duration_minutes)
       VALUES ($1,$2,$3) RETURNING id`,[name,sportType,durationMinutes]);
    await insertSets(client,'template_sets','template_id',created.rows[0].id,sets);
    await client.query('COMMIT');
    return reply.code(201).send({id:created.rows[0].id});
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {client.release();}
});

app.delete<{Params:{id:string}}>('/api/templates/:id', async (request,reply) => {
  const id = Number(request.params.id);
  if (!Number.isSafeInteger(id) || id < 1) return inputError(reply,'Invalid template ID');
  const result = await pool.query('DELETE FROM templates WHERE id=$1',[id]);
  if (result.rowCount === 0) return reply.code(404).send({error:'Шаблон не найден'});
  return reply.code(204).send();
});

app.setErrorHandler((error, _request, reply) => {
  app.log.error(error);
  const pgError = error as { code?: string; statusCode?: number; message?: string };
  if (pgError.statusCode && pgError.statusCode >= 400 && pgError.statusCode < 500) return reply.code(pgError.statusCode).send({error:pgError.message || 'Invalid request'});
  if (pgError.code === '23503') return reply.code(400).send({error:'Выбранное упражнение не найдено'});
  return reply.code(500).send({error:'Ошибка сервера. Проверьте журнал API.'});
});

async function main() {
  await ensureSchema();
  const port = Number(process.env.PORT || 3001);
  await app.listen({port,host:'127.0.0.1'});
}

main().catch((err)=> {app.log.error(err);process.exitCode=1;});
