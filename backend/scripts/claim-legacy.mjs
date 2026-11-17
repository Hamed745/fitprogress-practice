// Optional one-time import of pre-account data. Run locally after registering the rightful owner.
// npm run claim:legacy -- user@example.com --confirm
import 'dotenv/config';
import pg from 'pg';
const email = process.argv[2]?.trim().toLowerCase();
if (!email || !email.includes('@') || process.argv[3] !== '--confirm') {
  console.error('Usage: npm run claim:legacy -- YOUR_EMAIL --confirm');
  console.error('This explicitly assigns ALL unowned pre-login workouts, templates, and private exercises to the given account.');
  process.exit(1);
}
const client = new pg.Client({connectionString:process.env.DATABASE_URL||'postgresql://fitprogress:fitprogress_local@localhost:5433/fitprogress'});
try {
  await client.connect();
  await client.query('BEGIN');
  const {rows} = await client.query('SELECT id,name,email FROM users WHERE email=$1',[email]);
  if (!rows.length) throw new Error('Account not found. Register in FitProgress first.');
  const id = rows[0].id;
  const exercises=await client.query('UPDATE exercises SET owner_id=$1 WHERE owner_id IS NULL AND is_public=FALSE',[id]);
  const workouts=await client.query('UPDATE workouts SET owner_id=$1 WHERE owner_id IS NULL',[id]);
  const templates=await client.query('UPDATE templates SET owner_id=$1 WHERE owner_id IS NULL',[id]);
  await client.query('COMMIT');
  console.log(`Imported into ${rows[0].email}: ${workouts.rowCount} workouts, ${templates.rowCount} templates, ${exercises.rowCount} custom exercises.`);
} catch(error) {
  await client.query('ROLLBACK').catch(()=>{});
  console.error(error);
  process.exitCode=1;
} finally {await client.end().catch(()=>{});}
