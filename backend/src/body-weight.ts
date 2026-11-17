import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { pool } from './db.js';

// Dates are strictly validated to prevent PostgreSQL from silently normalizing them.
export const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((date) => {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
}, 'Invalid calendar date');

export const bodyWeightSchema = z.object({
  measuredOn: dateSchema,
  weightKg: z.number().finite().positive().max(1000),
  note: z.string().max(300).default(''),
});
const publicColumns = `id, to_char(measured_on, 'YYYY-MM-DD') AS "measuredOn",
  weight_kg::float AS "weightKg", note`;
const idNumber = (id:string) => {
  const parsed = Number(id);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
};

export function bodyWeightRoutes(app:FastifyInstance):void {
  app.get('/api/body-weight', async (request) => {
    const {rows} = await pool.query(`SELECT ${publicColumns} FROM body_weight_entries
      WHERE owner_id=$1 ORDER BY measured_on DESC,id DESC`,[request.currentUser!.id]);
    return rows;
  });
  app.post('/api/body-weight', async (request,reply) => {
    const parsed=bodyWeightSchema.safeParse(request.body);
    if(!parsed.success)return reply.code(400).send({error:'Некорректные данные измерения'});
    const {measuredOn,weightKg,note}=parsed.data;
    try {
      const {rows}=await pool.query(`INSERT INTO body_weight_entries(owner_id,measured_on,weight_kg,note)
        VALUES($1,$2,$3,$4) RETURNING ${publicColumns}`,[request.currentUser!.id,measuredOn,weightKg,note]);
      return reply.code(201).send(rows[0]);
    }catch(error){
      if((error as {code?:string}).code==='23505')return reply.code(409).send({error:'Запись за эту дату уже существует. Отредактируйте её.'});
      throw error;
    }
  });
  app.put<{Params:{id:string}}>('/api/body-weight/:id',async(request,reply)=>{
    const id=idNumber(request.params.id);
    if(!id)return reply.code(400).send({error:'Некорректный идентификатор'});
    const parsed=bodyWeightSchema.safeParse(request.body);
    if(!parsed.success)return reply.code(400).send({error:'Некорректные данные измерения'});
    const {measuredOn,weightKg,note}=parsed.data;
    try{
      const {rows}=await pool.query(`UPDATE body_weight_entries SET measured_on=$1,weight_kg=$2,note=$3
        WHERE id=$4 AND owner_id=$5 RETURNING ${publicColumns}`,[measuredOn,weightKg,note,id,request.currentUser!.id]);
      if(!rows[0])return reply.code(404).send({error:'Запись не найдена'});
      return rows[0];
    }catch(error){
      if((error as {code?:string}).code==='23505')return reply.code(409).send({error:'Запись за эту дату уже существует. Отредактируйте её.'});
      throw error;
    }
  });
  app.delete<{Params:{id:string}}>('/api/body-weight/:id',async(request,reply)=>{
    const id=idNumber(request.params.id);
    if(!id)return reply.code(400).send({error:'Некорректный идентификатор'});
    const {rowCount}=await pool.query('DELETE FROM body_weight_entries WHERE id=$1 AND owner_id=$2',[id,request.currentUser!.id]);
    if(!rowCount)return reply.code(404).send({error:'Запись не найдена'});
    return reply.code(204).send();
  });
}
