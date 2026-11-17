import pg from 'pg';

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://fitprogress:fitprogress_local@localhost:5433/fitprogress',
});

export async function ensureSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS exercises (
      id SERIAL PRIMARY KEY,
      name VARCHAR(120) NOT NULL,
      muscle_group VARCHAR(60) NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS workouts (
      id SERIAL PRIMARY KEY,
      performed_on DATE NOT NULL,
      sport_type VARCHAR(90) NOT NULL,
      duration_minutes INTEGER NOT NULL CHECK (duration_minutes >= 0),
      notes TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS workout_sets (
      id SERIAL PRIMARY KEY,
      workout_id INTEGER NOT NULL REFERENCES workouts(id) ON DELETE CASCADE,
      exercise_id INTEGER NOT NULL REFERENCES exercises(id),
      repetitions INTEGER NOT NULL DEFAULT 0 CHECK (repetitions >= 0),
      weight_kg NUMERIC(9,2) NOT NULL DEFAULT 0 CHECK (weight_kg >= 0),
      duration_seconds INTEGER NOT NULL DEFAULT 0 CHECK (duration_seconds >= 0)
    );
    CREATE TABLE IF NOT EXISTS templates (
      id SERIAL PRIMARY KEY,
      name VARCHAR(120) NOT NULL,
      sport_type VARCHAR(90) NOT NULL,
      duration_minutes INTEGER NOT NULL DEFAULT 45,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS template_sets (
      id SERIAL PRIMARY KEY,
      template_id INTEGER NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
      exercise_id INTEGER NOT NULL REFERENCES exercises(id),
      repetitions INTEGER NOT NULL DEFAULT 0,
      weight_kg NUMERIC(9,2) NOT NULL DEFAULT 0,
      duration_seconds INTEGER NOT NULL DEFAULT 0
    );
  `);
  const { rows } = await pool.query<{ count: string }>('SELECT COUNT(*)::text AS count FROM exercises');
  if (Number(rows[0]?.count) === 0) {
    const defaults = [
      ['Приседания', 'Ноги', 'Упражнение для развития мышц ног'],
      ['Жим лёжа', 'Грудь', 'Базовое упражнение для грудных мышц'],
      ['Становая тяга', 'Спина', 'Упражнение для мышц задней цепи'],
      ['Подтягивания', 'Спина', 'Упражнение с собственным весом'],
      ['Планка', 'Корпус', 'Статическое упражнение на стабилизацию'],
      ['Бег', 'Кардио', 'Кардиотренировка на дорожке или улице'],
      ['Выпады', 'Ноги', 'Развитие устойчивости и силы ног'],
      ['Жим гантелей', 'Плечи', 'Упражнение для плечевого пояса'],
    ];
    for (const [name, group, description] of defaults) {
      await pool.query('INSERT INTO exercises (name, muscle_group, description) VALUES ($1,$2,$3)', [name, group, description]);
    }
  }
}
