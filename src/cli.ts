import "./env.js"
import { Effect } from "effect"
import path from "node:path"
import { loadFolder, loadZip, FIXTURE_DIR } from "./engine/load.js"
import { runAudit } from "./engine/audit.js"
import { evaluate } from "./engine/evaluate.js"
import { SCORE_FORMULA } from "./engine/score.js"
import { AppLive, NoDbLive, saveRun } from "./db/repo.js"
import { readFile } from "node:fs/promises"
import type { AuditRun } from "./engine/schema.js"

const args = process.argv.slice(2)
const flag = (name: string) => {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : undefined
}
const found = args.find((a, i) => !a.startsWith("--") && !args[i - 1]?.startsWith("--label") && !args[i - 1]?.startsWith("--today"))
if (!found) {
  console.error("usage: pnpm run audit <folder|file.zip> [--save] [--label name] [--today YYYY-MM-DD]")
  process.exit(1)
}
const target: string = found
const today = flag("--today") ? new Date(`${flag("--today")}T12:00:00Z`) : undefined
const label = flag("--label") ?? path.basename(path.resolve(target))

const audit = Effect.gen(function* () {
  const files = target.endsWith(".zip") ? yield* loadZip(new Uint8Array(yield* Effect.promise(() => readFile(target)))) : yield* loadFolder(target)
  return yield* runAudit(files, { label, source: `folder:${target}`, ...(today ? { today } : {}), progress: (s) => process.stderr.write(`  ${s}\n`) })
})

const print = (run: AuditRun) => {
  console.log(`\nMemory Audit: ${run.label}`)
  console.log(`Files ${run.fileCount} · Facts ${run.factCount} · Health ${run.healthScore}/100  (${SCORE_FORMULA})`)
  for (const w of run.warnings) console.log(`! ${w}`)
  console.table(run.counts)
  console.table(run.findings.map((f) => ({ severity: f.severity, check: f.check, title: f.title.slice(0, 80), files: [...new Set(f.evidence.map((e) => e.file))].join(", ") })))
  if (path.resolve(target).startsWith(path.join(FIXTURE_DIR, "memories"))) {
    const ev = evaluate(run.findings)
    console.log("\nAgainst fixtures/northwind/expected.json:")
    console.table(ev.rows)
    const missed = ev.matches.filter((m) => !m.findingId).map((m) => `${m.expected.id} ${m.expected.description}`)
    if (missed.length) console.log("Missed:\n  " + missed.join("\n  "))
    if (ev.falsePositives.length) console.log("False positives:\n  " + ev.falsePositives.map((f) => `${f.check}: ${f.title}`).join("\n  "))
  }
}

const withDb = Effect.gen(function* () {
  const { run, files } = yield* audit
  return args.includes("--save") ? yield* saveRun(run, files) : run
}).pipe(Effect.provide(AppLive))

const program = withDb.pipe(
  Effect.catchAll((e) =>
    e._tag !== "DbError" || args.includes("--save")
      ? Effect.fail(e)
      : Effect.sync(() => console.error(`  (${e.message} Using an in-memory LLM cache.)`)).pipe(
          Effect.zipRight(audit.pipe(Effect.map((r) => r.run), Effect.provide(NoDbLive))),
        ),
  ),
)

Effect.runPromise(program).then(print, (e: unknown) => {
  console.error(e instanceof Error ? e.message : JSON.stringify(e))
  process.exit(1)
})
