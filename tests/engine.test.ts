import "../src/env.js"
import { describe, expect, it } from "vitest"
import { Effect } from "effect"
import { loadFixture } from "../src/engine/load.js"
import { runAudit } from "../src/engine/audit.js"
import { evaluate } from "../src/engine/evaluate.js"
import { mask, maskText } from "../src/engine/checks/secrets.js"
import { scopeFor } from "../src/engine/scopes.js"
import { AppLive, NoDbLive } from "../src/db/repo.js"

const today = new Date("2026-11-15T12:00:00Z")
const llmEnabled = Boolean(process.env.ANTHROPIC_API_KEY)

const auditFixture = Effect.gen(function* () {
  const files = yield* loadFixture()
  return yield* runAudit(files, { label: "test", source: "fixture", today })
})
// Postgres cache when available (fast, free re-runs), in-memory otherwise.
const run = () =>
  Effect.runPromise(
    auditFixture.pipe(
      Effect.provide(AppLive),
      Effect.catchAll(() => auditFixture.pipe(Effect.provide(NoDbLive))),
    ),
  )

describe("scopes and masking", () => {
  it("maps paths to scopes", () => {
    expect(scopeFor("projects/acme-pilot/notes.md")).toEqual({ scope: "project", scopeOwner: "acme-pilot" })
    expect(scopeFor("misc/readme.md")).toEqual({ scope: "unknown" })
  })
  it("masks secrets to first 6 + last 4", () => {
    const key = "sk-ant-api03-FAKEk3yN0tR3alDoNotUse-x9Qm2Lp8Vt4Rz7Wc1Yb6Hn5Jd0Fg3KsDEMOONLY"
    expect(mask(key)).toBe("sk-ant…ONLY")
    expect(maskText(`key ${key} here`)).not.toContain("x9Qm2Lp8")
  })
})

describe("Northwind fixture", () => {
  it(
    "matches expected.json",
    async () => {
      const { run: result, files } = await run()
      const ev = evaluate(result.findings)
      const total = ev.rows.find((r) => r.check === "total")!
      console.table(ev.rows)

      // Deterministic checks must always catch their planted issues.
      for (const check of ["stale", "duplicate", "scope_leak", "secret"] as const)
        expect(ev.rows.find((r) => r.check === check)!.missed, check).toBe(0)
      expect(total.falsePositives).toBeLessThanOrEqual(2)
      if (llmEnabled) expect(total.caught).toBeGreaterThanOrEqual(11)

      // No raw secret survives into findings or stored file content.
      const blob = JSON.stringify(result) + JSON.stringify(files)
      expect(blob).not.toContain("x9Qm2Lp8Vt4Rz7")
    },
    120_000,
  )
})
