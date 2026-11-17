import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { pool } from './db.js';
import { cookieHeader, parseCookie, sessionHash } from './auth-core.js';
export {allowedOrigin, cookieHeader, hashPassword, normalizeEmail, parseCookie, sessionHash, verifyPassword} from './auth-core.js';

const SESSION_LIFETIME_MS=7*24*60*60*1000;
export const registerSchema=z.object({name:z.string().trim().min(2).max(80),email:z.string().trim().email().max(254),password:z.string().min(10).max(128)});
export const loginSchema=z.object({email:z.string().trim().email().max(254),password:z.string().min(1).max(128)});
export type AuthUser={id:number;name:string;email:string};
declare module 'fastify' {interface FastifyRequest {currentUser?:AuthUser;sessionToken?:string}}

export async function createSession(userId:number,reply:FastifyReply):Promise<void>{
  const token=randomBytes(32).toString('hex');
  await pool.query('INSERT INTO auth_sessions(user_id,token_hash,expires_at) VALUES($1,$2,$3)',
    [userId,sessionHash(token),new Date(Date.now()+SESSION_LIFETIME_MS)]);
  reply.header('Set-Cookie',cookieHeader(token,Math.floor(SESSION_LIFETIME_MS/1000)));
}
export async function findSession(request:FastifyRequest):Promise<AuthUser|null>{
  const token=parseCookie(request.headers.cookie);
  if(!token)return null;
  const {rows}=await pool.query<AuthUser>(`SELECT u.id,u.name,u.email FROM auth_sessions s JOIN users u ON u.id=s.user_id
    WHERE s.token_hash=$1 AND s.expires_at>NOW()`,[sessionHash(token)]);
  if(!rows[0])return null;
  request.sessionToken=token;
  return rows[0];
}
const attempts=new Map<string,{count:number;until:number}>();
export function limitLogin(ip:string):boolean{
  const now=Date.now(),prior=attempts.get(ip);
  if(!prior||prior.until<=now){attempts.set(ip,{count:1,until:now+15*60_000});return true;}
  if(prior.count>=10)return false;
  prior.count++;return true;
}
export function resetLoginLimit(ip:string):void{attempts.delete(ip);}
export function authProblem(reply:FastifyReply){return reply.code(401).send({error:'Необходимо войти в аккаунт'});}
