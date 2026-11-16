import { readFileSync } from "node:fs"
import path from "node:path"
import { CHECKS, type CheckType, type Finding } from "./schema.js"
import { FIXTURE_DIR } from "./load.js"

export type Expected = { id: string; check: CheckType; description: string; files: { path: string; line: number }[] }
export type CheckScore = { check: CheckType | "total"; expected: number; caught: number; missed: number; falsePositives: number }
export type Evaluation = {
  rows: CheckScore[]
  matches: { expected: Expected; findingId: string | undefined }[]
  falsePositives: { id: string; title: string; check: CheckType }[]
}

export const loadExpected = (): Expected[] =>
  (JSON.parse(readFileSync(path.join(FIXTURE_DIR, "expected.json"), "utf8")) as { issues: Expected[] }).issues

// A finding matches an expected issue when the check agrees and it points at the planted files
// (all of them for 1–2 file issues, at least 2 for 3-file duplicates), near the planted line.
const matches = (f: Finding, e: Expected) => {
  if (f.check !== e.check) return false
  const near = (p: { path: string; line: number }) =>
    f.evidence.some((ev) => ev.file === p.path && p.line >= ev.lineStart - 2 && p.line <= ev.lineEnd + 2)
  const hit = e.files.filter(near).length
  return hit >= Math.min(2, e.files.length)
}

export const evaluate = (findings: readonly Finding[], expected = loadExpected()): Evaluation => {
  const used = new Set<string>()
  const pairs = expected.map((e) => {
    const f = findings.find((x) => !used.has(x.id) && matches(x, e))
    if (f) used.add(f.id)
    return { expected: e, findingId: f?.id }
  })
  const fps = findings.filter((f) => !used.has(f.id))
  const row = (check: CheckType | "total", es: typeof pairs, fp: Finding[]): CheckScore => ({
    check,
    expected: es.length,
    caught: es.filter((p) => p.findingId).length,
    missed: es.filter((p) => !p.findingId).length,
    falsePositives: fp.length,
  })
  return {
    rows: [
      ...CHECKS.map((c) => row(c, pairs.filter((p) => p.expected.check === c), fps.filter((f) => f.check === c))),
      row("total", pairs, fps),
    ],
    matches: pairs,
    falsePositives: fps.map((f) => ({ id: f.id, title: f.title, check: f.check })),
  }
}
