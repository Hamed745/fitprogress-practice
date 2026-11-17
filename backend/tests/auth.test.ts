import assert from 'node:assert/strict';
import test from 'node:test';
import { allowedOrigin, cookieHeader, hashPassword, normalizeEmail, parseCookie, sessionHash, verifyPassword } from '../src/auth-core.ts';

test('password hashing uses random salts and verification rejects bad passwords',async()=>{
  const original='a long password 2026';
  const first=await hashPassword(original);
  const second=await hashPassword(original);
  assert.notEqual(first,second);
  assert.equal(first.includes(original),false);
  assert.equal(await verifyPassword(original,first),true);
  assert.equal(await verifyPassword('wrong password',first),false);
  assert.equal(await verifyPassword(original,'invalid hash'),false);
});
test('email canonicalization',()=>{
  assert.equal(normalizeEmail('  User@Example.COM '),'user@example.com');
});
test('session cookie is HttpOnly and validated strictly',()=>{
  const token='a'.repeat(64);
  assert.equal(parseCookie('other=abc; fitprogress_session='+token),token);
  assert.equal(parseCookie('fitprogress_session=not-a-token'),null);
  assert.equal(cookieHeader(token,60).includes('HttpOnly; SameSite=Lax; Path=/; Max-Age=60'),true);
  assert.notEqual(sessionHash(token),token);
});
test('cross-site browser POST is rejected by origin check',()=>{
  assert.equal(allowedOrigin('http://127.0.0.1:5173'),true);
  assert.equal(allowedOrigin('http://localhost:5173'),true);
  assert.equal(allowedOrigin('https://evil.example'),false);
});
