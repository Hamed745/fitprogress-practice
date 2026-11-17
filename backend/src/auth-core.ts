import { randomBytes, scrypt as scryptCallback, createHash, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);
const KEY_LENGTH = 64;
export const COOKIE_NAME = 'fitprogress_session';
export function normalizeEmail(email: string): string {return email.trim().toLowerCase();}
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const derived = await scrypt(password, salt, KEY_LENGTH) as Buffer;
  return `scrypt$${salt}$${derived.toString('hex')}`;
}
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts=stored.split('$');
  if(parts.length!==3||parts[0]!=='scrypt'||!/^[a-f0-9]{32}$/.test(parts[1])||!/^[a-f0-9]{128}$/.test(parts[2]))return false;
  const actual=await scrypt(password,parts[1],KEY_LENGTH) as Buffer;
  return timingSafeEqual(actual,Buffer.from(parts[2],'hex'));
}
export function sessionHash(token:string):string {return createHash('sha256').update(token).digest('hex');}
export function parseCookie(header:string|undefined,name=COOKIE_NAME):string|null {
  const value=header?.split(';').map(s=>s.trim()).find(s=>s.startsWith(`${name}=`));
  const token=value?.slice(name.length+1);
  return token&&/^[a-f0-9]{64}$/.test(token)?token:null;
}
export function cookieHeader(token:string,maxAgeSeconds:number):string {
  return `${COOKIE_NAME}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAgeSeconds}${process.env.NODE_ENV==='production'?'; Secure':''}`;
}
export function allowedOrigin(origin:string|undefined):boolean {
  if(!origin)return true;
  return new Set(['http://localhost:5173','http://127.0.0.1:5173',process.env.FRONTEND_ORIGIN].filter(Boolean)).has(origin);
}
