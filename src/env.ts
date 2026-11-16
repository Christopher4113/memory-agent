// Load .env if present (Node ≥ 21). Imported first by entry points.
try {
  process.loadEnvFile()
} catch {
  // no .env: fine, deterministic checks still run
}
