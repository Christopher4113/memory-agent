import { Effect } from "effect"
import { type AuditRun, CHECKS, type CheckType, type Finding, type MemoryFile, type Progress } from "./schema.js"
import { Llm } from "./llm.js"
import { checkSecrets, maskFile } from "./checks/secrets.js"
import { checkDuplicates } from "./checks/duplicates.js"
import { checkScopeLeaks } from "./checks/scopeLeaks.js"
import { checkContradictions } from "./checks/contradictions.js"
import { checkStaleDeterministic, checkStaleSuperseded } from "./checks/stale.js"
import { healthScore } from "./score.js"

const SEV = { high: 0, medium: 1, low: 2 } as const

export type AuditOptions = { label: string; source: string; today?: Date; progress?: Progress }

// Drop a finding if an earlier one of the same check already covers its first evidence line.
const dedupe = (fs: Finding[]) => {
  const seen = new Set<string>()
  return fs.filter((f) => {
    const e = f.evidence[0]!
    const k = `${f.check}|${e.file}|${e.lineStart}`
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}

export const runAudit = (rawFiles: readonly MemoryFile[], opts: AuditOptions) =>
  Effect.gen(function* () {
    const llm = yield* Llm
    const today = opts.today ?? new Date()
    const progress: Progress = opts.progress ?? (() => {})
    const warnings: string[] = []
    progress(`Loaded ${rawFiles.length} files`, 0.05)

    // Secrets run on raw text; everything after this point sees masked text only (incl. LLM prompts and the DB).
    const secrets = checkSecrets(rawFiles)
    const files = rawFiles.map(maskFile)
    const duplicates = checkDuplicates(files)
    const staleDet = checkStaleDeterministic(files, today)
    progress("Checking scope leaks", 0.12)
    const leaks = yield* checkScopeLeaks(files)

    let facts = 0
    let contradictions: Finding[] = []
    let superseded: Finding[] = []
    if (llm.enabled) {
      const r = yield* checkContradictions(files, today, progress)
      facts = r.facts.length
      contradictions = r.findings
      superseded = checkStaleSuperseded(r.superseded, files)
      warnings.push(...r.warnings)
    } else warnings.push("LLM checks skipped: add ANTHROPIC_API_KEY.")

    const findings = dedupe([...secrets, ...leaks, ...contradictions, ...staleDet, ...superseded, ...duplicates]).sort(
      (a, b) => SEV[a.severity] - SEV[b.severity] || CHECKS.indexOf(a.check) - CHECKS.indexOf(b.check),
    )
    const counts = Object.fromEntries(CHECKS.map((c) => [c, findings.filter((f) => f.check === c).length])) as Record<CheckType, number>
    progress(`Done: ${findings.length} findings`, 1)

    const run: AuditRun = {
      id: 0,
      label: opts.label,
      createdAt: new Date().toISOString(),
      source: opts.source,
      fileCount: files.length,
      factCount: facts,
      healthScore: healthScore(findings),
      counts,
      findings,
      warnings,
      llmEnabled: llm.enabled,
    }
    return { run, files }
  })
