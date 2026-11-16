CREATE TABLE IF NOT EXISTS runs (
  id          SERIAL PRIMARY KEY,
  label       TEXT NOT NULL,
  source      TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  health      INT NOT NULL,
  data        JSONB NOT NULL
);
CREATE TABLE IF NOT EXISTS run_files (
  run_id   INT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  path     TEXT NOT NULL,
  scope    TEXT NOT NULL,
  content  TEXT NOT NULL,  -- secrets masked before insert
  PRIMARY KEY (run_id, path)
);
CREATE TABLE IF NOT EXISTS llm_cache (
  key         TEXT PRIMARY KEY,  -- sha256(model + prompt)
  value       TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
