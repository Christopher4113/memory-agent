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
  String.raw`\b(\d{4})-(\d{2})-(\d{2})(?!\d)|\b(${MONTHS.join("|")})[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?\b`,
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

const day = (d: Date) => d.toISOString().slice(0, 10)

// Dates that appear only in a leading YAML frontmatter block (export/tool metadata, not a statement about any fact).
// A date the body also states (e.g. "Last updated: Nov 12") is kept.
export const frontmatterDays = (lines: readonly string[], today: Date): Set<string> => {
  if (lines[0]?.trim() !== "---") return new Set()
  const end = lines.findIndex((l, i) => i > 0 && l.trim() === "---")
  if (end < 0) return new Set()
  const body = new Set(lines.slice(end + 1).flatMap((l) => findDates(l, today)).map(day))
  return new Set(lines.slice(1, end).flatMap((l) => findDates(l, today)).map(day).filter((d) => !body.has(d)))
}

// A fact's date only counts if it isn't just the frontmatter timestamp, unless the fact's own line repeats it.
export const factDate = (asOf: string | undefined, text: string, fmDays: Set<string>, today: Date): Date | undefined => {
  const d = parseDate(asOf, today)
  if (!d || !fmDays.has(day(d))) return d
  return findDates(text, today).some((x) => day(x) === day(d)) ? d : undefined
}

// Keep the original line's indentation and list marker if a rewrite dropped them.
export const keepListMarker = (before: string, after: string): string => {
  const marker = before.match(/^\s*(?:[-*+]|\d+\.)\s+/)?.[0]
  return marker && !/^\s*(?:[-*+]|\d+\.)\s+/.test(after) ? marker + after.trimStart() : after
}
