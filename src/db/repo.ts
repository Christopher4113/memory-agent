import { Context, Effect, Layer, Option } from "effect"
import postgres from "postgres"
import { readFileSync } from "node:fs"
import path from "node:path"
import { type AuditRun, DbError, type Finding, type MemoryFile } from "../engine/schema.js"
import { LlmCache, LlmLive, MemoryCacheLive } from "../engine/llm.js"

export class Db extends Context.Tag("Db")<Db, { sql: postgres.Sql }>() {}

const q = <A>(f: () => Promise<A>) =>
  Effect.tryPromise({ try: f, catch: (e) => new DbError({ message: `Database error: ${e instanceof Error ? e.message : String(e)}` }) })

export const DbLive = Layer.scoped(
  Db,
  Effect.acquireRelease(
    Effect.gen(function* () {
      const url = process.env.DATABASE_URL ?? "postgres://audit:audit@localhost:5433/memory_audit"
      const sql = postgres(url, { onnotice: () => {}, connect_timeout: 3 })
      const migration = readFileSync(path.join(import.meta.dirname, "migrate.sql"), "utf8")
      yield* q(() => sql.unsafe(migration)).pipe(
        Effect.mapError(() => new DbError({ message: "Can't reach Postgres. Run `docker compose up -d` and check DATABASE_URL." })),
      )
      return { sql }
    }),
    ({ sql }) => Effect.promise(() => sql.end({ timeout: 2 })),
  ),
)

export const PgCacheLive = Layer.effect(
  LlmCache,
  Effect.map(Db, ({ sql }) => ({
    get: (key: string) =>
      q(() => sql<{ value: string }[]>`select value from llm_cache where key = ${key}`).pipe(
        Effect.map((rows) => Option.fromNullable(rows[0]?.value)),
        Effect.orElseSucceed(() => Option.none<string>()),
      ),
    set: (key: string, value: string) =>
      q(() => sql`insert into llm_cache (key, value) values (${key}, ${value}) on conflict (key) do update set value = excluded.value`).pipe(
        Effect.asVoid,
        Effect.orElseSucceed(() => undefined),
      ),
  })),
)

type RunRow = { id: number; label: string; source: string; created_at: Date; data: AuditRun }
const fromRow = (r: RunRow): AuditRun => ({ ...r.data, id: r.id, label: r.label, source: r.source, createdAt: r.created_at.toISOString() })

// Files arrive already masked by runAudit.
export const saveRun = (run: AuditRun, files: readonly MemoryFile[]) =>
  Effect.gen(function* () {
    const { sql } = yield* Db
    return yield* q(() =>
      sql.begin(async (tx) => {
        const [row] = await tx<RunRow[]>`
          insert into runs (label, source, health, data)
          values (${run.label}, ${run.source}, ${run.healthScore}, ${tx.json(JSON.parse(JSON.stringify(run)))})
          returning id, label, source, created_at, data`
        if (files.length)
          await tx`insert into run_files ${tx(files.map((f) => ({ run_id: row!.id, path: f.path, scope: f.scope, content: f.content })))}`
        return fromRow(row!)
      }),
    )
  })

export type RunSummary = Omit<AuditRun, "findings">

export const listRuns = Effect.gen(function* () {
  const { sql } = yield* Db
  const rows = yield* q(() => sql<RunRow[]>`select id, label, source, created_at, data from runs order by id desc limit 100`)
  return rows.map((r): RunSummary => {
    const { findings: _f, ...rest } = fromRow(r)
    return rest
  })
})

export const getRun = (id: number) =>
  Effect.gen(function* () {
    const { sql } = yield* Db
    const [row] = yield* q(() => sql<RunRow[]>`select id, label, source, created_at, data from runs where id = ${id}`)
    if (!row) return yield* new DbError({ message: `Run #${id} not found` })
    return fromRow(row)
  })

export const getFile = (runId: number, filePath: string) =>
  Effect.gen(function* () {
    const { sql } = yield* Db
    const [row] = yield* q(() => sql<{ path: string; scope: string; content: string }[]>`
      select path, scope, content from run_files where run_id = ${runId} and path = ${filePath}`)
    if (!row) return yield* new DbError({ message: `File ${filePath} not found in run #${runId}` })
    return row
  })

export const listFiles = (runId: number) =>
  Effect.gen(function* () {
    const { sql } = yield* Db
    return yield* q(() => sql<{ path: string; scope: string }[]>`select path, scope from run_files where run_id = ${runId} order by path`)
  })

export const diffRuns = (a: number, b: number) =>
  Effect.gen(function* () {
    const [ra, rb] = yield* Effect.all([getRun(a), getRun(b)])
    const ids = (r: AuditRun) => new Set(r.findings.map((f) => f.id))
    const ia = ids(ra)
    const ib = ids(rb)
    const added: Finding[] = rb.findings.filter((f) => !ia.has(f.id))
    const resolved: Finding[] = ra.findings.filter((f) => !ib.has(f.id))
    return { a: ra.id, b: rb.id, added, resolved, unchanged: rb.findings.length - added.length }
  })

// Llm + Postgres-backed cache + Db.
export const AppLive = LlmLive.pipe(Layer.provideMerge(PgCacheLive), Layer.provideMerge(DbLive))
// Llm with an in-memory cache, for when Postgres isn't running.
export const NoDbLive = LlmLive.pipe(Layer.provide(MemoryCacheLive))
