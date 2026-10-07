CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('student','teacher')),
  class_name    TEXT,
  school        TEXT,
  city          TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS attempts (
  id           TEXT PRIMARY KEY,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source       TEXT NOT NULL,
  chapter_id   TEXT,
  lesson_id    TEXT,
  percent      INTEGER NOT NULL,
  correct      INTEGER NOT NULL DEFAULT 0,
  total        INTEGER NOT NULL DEFAULT 0,
  wrong        INTEGER NOT NULL DEFAULT 0,
  duration_sec INTEGER NOT NULL DEFAULT 0,
  is_review    BOOLEAN NOT NULL DEFAULT false,
  answers      JSONB NOT NULL DEFAULT '[]',
  ts           BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS attempts_user_idx ON attempts(user_id);
CREATE INDEX IF NOT EXISTS attempts_source_idx ON attempts(source);

CREATE TABLE IF NOT EXISTS surveys (
  id      SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind    TEXT NOT NULL CHECK (kind IN ('student','teacher')),
  answers JSONB NOT NULL DEFAULT '{}',
  ts      BIGINT NOT NULL
);
