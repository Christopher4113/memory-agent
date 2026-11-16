import { createHash } from "node:crypto"
import type { CheckType, Evidence, MemoryFile } from "./schema.js"

export const sha = (s: string) => createHash("sha256").update(s).digest("hex")

// Stable id so the same issue gets the same id across runs (used by run diff).
export const findingId = (check: CheckType, evidence: readonly Evidence[]) =>
  `${check}-${sha(
    check + evidence.map((e) => `${e.file}|${e.snippet.toLowerCase().replace(/\s+/g, " ").slice(0, 80)}`).sort().join("||"),
  ).slice(0, 12)}`

export const evidenceAt = (f: MemoryFile, lineStart: number, lineEnd = lineStart): Evidence => ({
  file: f.path,
  scope: f.scope,
  lineStart,
  lineEnd,
  snippet: f.lines.slice(lineStart - 1, lineEnd).join("\n"),
})

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"]
const DATE_RE = new RegExp(
  String.raw`\b(\d{4})-(\d{2})-(\d{2})\b|\b(${MONTHS.join("|")})[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?\b`,
  "gi",
)

// Finds dates in a line. Month-day without a year assumes the year of `today`.
export const findDates = (text: string, today: Date): Date[] => {
  const out: Date[] = []
  for (const m of text.matchAll(DATE_RE)) {
    if (m[1]) out.push(new Date(Date.UTC(+m[1], +m[2]! - 1, +m[3]!)))
    else if (m[4]) {
      const month = MONTHS.indexOf(m[4].slice(0, 3).toLowerCase())
      const year = m[6] ? +m[6] : today.getUTCFullYear()
      out.push(new Date(Date.UTC(year, month, +m[5]!)))
    }
  }
  return out
}

export const stripDates = (text: string) => text.replace(DATE_RE, " ")

export const parseDate = (s: string | undefined, today: Date): Date | undefined => {
  if (!s) return undefined
  return findDates(s, today)[0]
}
