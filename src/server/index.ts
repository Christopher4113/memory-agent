import "../env.js"
import { serve } from "@hono/node-server"
import { Hono, type Context } from "hono"
import { streamSSE } from "hono/streaming"
import { Effect, Either, ManagedRuntime } from "effect"
import { loadFixture, loadFolder, loadZip } from "../engine/load.js"
import { runAudit } from "../engine/audit.js"
import type { Llm } from "../engine/llm.js"
import { evaluate } from "../engine/evaluate.js"
import { SCORE_FORMULA } from "../engine/score.js"
import { type AuditError, type AuditRun, DbError, LoadError, type MemoryFile, type Progress } from "../engine/schema.js"
import { AppLive, type Db, diffRuns, getFile, getRun, listFiles, listRuns, saveRun } from "../db/repo.js"

const runtime = ManagedRuntime.make(AppLive)

const friendly = (e: AuditError) => e.message || "Something went wrong"

// Run an Effect program and turn typed failures into a JSON error, never a stack trace.
const handle = async <A>(c: Context, program: Effect.Effect<A, AuditError, Db | Llm>) => {
  const result = await runtime.runPromise(Effect.either(program)).catch((e: unknown): Either.Either<A, AuditError> => {
    console.error("[server] unexpected failure:", e instanceof Error ? e.message : "unknown")
    return Either.left(new DbError({ message: "Can't reach Postgres. Run `docker compose up -d` and restart the server." }))
  })
  return Either.isRight(result) ? c.json(result.right as object) : c.json({ error: friendly(result.left) }, 400)
}

type AuditRequest = { files: Effect.Effect<MemoryFile[], AuditError>; label: string; source: string }

const parseRequest = async (c: Context): Promise<AuditRequest> => {
  const ct = c.req.header("content-type") ?? ""
  if (ct.includes("multipart/form-data")) {
    const form = await c.req.formData()
    const file = form.get("file")
    const label = String(form.get("label") ?? "")
    if (!(file instanceof File)) return { files: Effect.fail(new LoadError({ message: "No .zip file in upload" })), label, source: "zip" }
    const bytes = new Uint8Array(await file.arrayBuffer())
    return { files: loadZip(bytes), label: label || file.name.replace(/\.zip$/i, ""), source: `zip:${file.name}` }
  }
  const body = (await c.req.json().catch(() => ({}))) as { source?: string; path?: string; label?: string; snapshot?: string }
  if (body.source === "folder" && body.path) return { files: loadFolder(body.path), label: body.label || body.path, source: `folder:${body.path}` }
  const snapshot = body.snapshot === "earlier" ? "earlier" : "current"
  return {
    files: loadFixture(snapshot),
    label: body.label || (snapshot === "earlier" ? "Northwind · week 1" : "Northwind · week 2"),
    source: `fixture:${snapshot}`,
  }
}

const auditProgram = (req: AuditRequest, progress: Progress) =>
  Effect.gen(function* () {
    const files = yield* req.files
    if (!files.length) return yield* Effect.fail(new LoadError({ message: "No Markdown files found" }))
    const { run, files: masked } = yield* runAudit(files, { label: req.label, source: req.source, progress })
    return yield* saveRun(run, masked)
  })

const app = new Hono()

app.post("/api/audit", async (c) => handle(c, auditProgram(await parseRequest(c), () => {})))

// Same as /api/audit, streamed as SSE: progress events, then a final "done" (run) or "error".
app.post("/api/audit/stream", async (c) => {
  const req = await parseRequest(c)
  return streamSSE(c, async (stream) => {
    const send = (event: string, data: unknown) => stream.writeSSE({ event, data: JSON.stringify(data) })
    const progress: Progress = (step, pct) => void send("progress", { step, pct })
    const result = await runtime
      .runPromise(Effect.either(auditProgram(req, progress)))
      .catch((): Either.Either<AuditRun, AuditError> => Either.left(new DbError({ message: "Can't reach Postgres. Run `docker compose up -d` and restart the server." })))
    if (Either.isRight(result)) await send("done", result.right)
    else await send("error", { error: friendly(result.left) })
  })
})

app.get("/api/runs", (c) => handle(c, listRuns))
app.get("/api/runs/:id", (c) => handle(c, getRun(Number(c.req.param("id")))))
app.get("/api/runs/:id/files", (c) => handle(c, listFiles(Number(c.req.param("id")))))
app.get("/api/runs/:id/results", (c) =>
  handle(
    c,
    getRun(Number(c.req.param("id"))).pipe(
      Effect.map((r: AuditRun) => (r.source.startsWith("fixture:current") ? { applicable: true, ...evaluate(r.findings) } : { applicable: false })),
    ),
  ),
)
app.get("/api/diff", (c) => handle(c, diffRuns(Number(c.req.query("a")), Number(c.req.query("b")))))
app.get("/api/files", (c) => handle(c, getFile(Number(c.req.query("run")), c.req.query("path") ?? "")))
app.get("/api/meta", (c) =>
  c.json({ llmEnabled: Boolean(process.env.ANTHROPIC_API_KEY), model: process.env.LLM_MODEL || "claude-haiku-5-5", scoreFormula: SCORE_FORMULA }),
)

const port = Number(process.env.API_PORT ?? 8787)
serve({ fetch: app.fetch, port }, () => console.log(`[server] http://localhost:${port}`))
