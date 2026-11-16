import type { Fact, Finding, MemoryFile } from "../schema.js"
import { evidenceAt, findDates, findingId } from "../util.js"

const PENDING = /\b(upcoming|pending|blocked|scheduled|waiting on|awaiting|not started|in progress|todo|eta|due)\b/i

const fmt = (d: Date) => d.toISOString().slice(0, 10)

// A dated line, still worded as pending/upcoming, whose date has passed.
export const checkStaleDeterministic = (files: readonly MemoryFile[], today: Date): Finding[] =>
  files.flatMap((f) =>
    f.lines.flatMap((line, i) => {
      if (!PENDING.test(line)) return []
      const past = findDates(line, today).filter((d) => d.getTime() < today.getTime())
      if (!past.length) return []
      const word = line.match(PENDING)![0]
      const evidence = [evidenceAt(f, i + 1)]
      return [
        {
          id: findingId("stale", evidence),
          check: "stale" as const,
          severity: "medium" as const,
          title: `"${word}" item dated ${fmt(past[0]!)} in ${f.path}`,
          explanation: `Line ${i + 1} is still worded as ${word.toLowerCase()} but its date (${fmt(past[0]!)}) is before today (${fmt(today)}). Confirm the outcome and update or remove it.`,
          evidence,
          suggestedFix: [{ file: f.path, before: line, after: `${line} <!-- outdated: confirm status -->` }],
        },
      ]
    }),
  )

export const checkStaleSuperseded = (pairs: readonly { older: Fact; newer: Fact }[], files: readonly MemoryFile[]): Finding[] => {
  const byPath = new Map(files.map((f) => [f.path, f]))
  return pairs.map(({ older, newer }) => {
    const of = byPath.get(older.file)!
    const evidence = [evidenceAt(of, older.lineStart, older.lineEnd), evidenceAt(byPath.get(newer.file)!, newer.lineStart, newer.lineEnd)]
    return {
      id: findingId("stale", evidence),
      check: "stale" as const,
      severity: "medium" as const,
      title: `${older.subject} ${older.attribute} superseded: "${older.value}" (${older.asOf}) → "${newer.value}" (${newer.asOf})`,
      explanation: `${older.file} still says "${older.value}" as of ${older.asOf}, but ${newer.file} records "${newer.value}" as of ${newer.asOf}.`,
      evidence,
      suggestedFix: [{ file: older.file, before: of.lines.slice(older.lineStart - 1, older.lineEnd).join("\n"), after: `${of.lines[older.lineStart - 1]!.replace(/:.*/, ":")} ${newer.value} (as of ${newer.asOf}, see ${newer.file})` }],
    }
  })
}
