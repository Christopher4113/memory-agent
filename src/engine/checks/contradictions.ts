import { Effect, Schema } from "effect"
import type { Fact, Finding, MemoryFile, Progress } from "../schema.js"
import { askJson } from "../llm.js"
import { SCOPE_RANK } from "../scopes.js"
import { evidenceAt, findingId, parseDate } from "../util.js"

const Extracted = Schema.Array(
  Schema.Struct({
    subject: Schema.String,
    attribute: Schema.String,
    value: Schema.String,
    asOf: Schema.optional(Schema.NullOr(Schema.String)),
    lineStart: Schema.Number,
    lineEnd: Schema.optional(Schema.Number),
  }),
)
const KeyGroups = Schema.Array(Schema.Array(Schema.String))
const Verdict = Schema.Struct({
  kind: Schema.Literal("conflict", "history", "different_context", "same"),
  reason: Schema.String,
  rewrites: Schema.optional(Schema.Array(Schema.Struct({ index: Schema.Number, after: Schema.String }))),
})

const numbered = (f: MemoryFile) => f.lines.map((l, i) => `${i + 1}| ${l}`).join("\n")

const extractFacts = (f: MemoryFile) =>
  askJson(
    Extracted,
    `Extract atomic, checkable facts from this Markdown memory file (${f.path}).
Only concrete claims another file could contradict: dates, deadlines, prices, owners, numbers, SLAs, statuses, rules.
Skip headings and vague statements. Use short lowercase subject and attribute names (e.g. subject "pro plan", attribute "price"; subject "v2 launch", attribute "date"; subject "acme pilot", attribute "owner").
asOf is the date the fact was stated as true, otherwise null. Use the most specific date: a date on the fact's own line ("as of Oct 3", a dated log entry, "effective Sep 1") wins over a file-level "last updated" date.
lineStart/lineEnd are the line numbers shown at the left.

${numbered(f)}

Answer as JSON only: [{"subject": "", "attribute": "", "value": "", "asOf": null, "lineStart": 1, "lineEnd": 1}]`,
  ).pipe(
    Effect.map((facts) =>
      facts.flatMap((x, i): Fact[] => {
        const lineStart = Math.min(Math.max(1, Math.round(x.lineStart)), f.lines.length)
        const lineEnd = Math.min(Math.max(lineStart, Math.round(x.lineEnd ?? lineStart)), f.lines.length)
        const text = f.lines.slice(lineStart - 1, lineEnd).join("\n").trim()
        if (!text) return []
        return [{ id: `${f.path}#${i}`, file: f.path, lineStart, lineEnd, subject: x.subject, attribute: x.attribute, value: x.value, ...(x.asOf ? { asOf: x.asOf } : {}), text }]
      }),
    ),
  )

// Simple aliasing: lowercase, drop punctuation, singularize, order-insensitive ("v2 launch" = "launch v2").
const singular = (w: string) => (w.length > 3 && /[^su]s$/.test(w) && !w.endsWith("is") ? w.slice(0, -1) : w)
const simpleKey = (f: Pick<Fact, "subject" | "attribute">) =>
  [f.subject, f.attribute]
    .map((s) => s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(Boolean).map(singular).sort().join(" "))
    .join(" :: ")
const normValue = (v: string) => v.toLowerCase().replace(/[^a-z0-9$.%]/g, "")
// "$39" and "$39 per seat until Aug 31" state the same value.
const sameValue = (a: string, b: string) => {
  const [x, y] = [normValue(a), normValue(b)]
  return x === y || (x.length > 0 && y.length > 0 && (x.includes(y) || y.includes(x)))
}

export type ContradictionResult = { facts: Fact[]; findings: Finding[]; superseded: { older: Fact; newer: Fact }[]; warnings: string[] }

export const checkContradictions = (files: readonly MemoryFile[], today: Date, progress: Progress) =>
  Effect.gen(function* () {
    const warnings: string[] = []
    const targets = files.filter((f) => f.content.trim())
    let done = 0
    const perFile = yield* Effect.forEach(
      targets,
      (f) =>
        extractFacts(f).pipe(
          Effect.catchAll((e) => Effect.sync(() => (warnings.push(`Skipped fact extraction for ${f.path}: ${e.message}`), [] as Fact[]))),
          Effect.tap(() => Effect.sync(() => progress(`Extracting facts (${++done}/${targets.length})`, 0.2 + 0.4 * (done / targets.length)))),
        ),
      { concurrency: 16 },
    )
    const facts = perFile.flat()
    progress(`Extracted ${facts.length} facts`, 0.6)

    // One call to merge differently-worded keys ("p1 ticket :: escalation deadline" vs "p1 incident :: escalation sla").
    // It returns only the merge groups, which keeps the reply short.
    const keys = [...new Set(facts.map(simpleKey))].sort()
    progress(`Grouping ${keys.length} fact keys`, 0.6)
    const groupsReply = yield* askJson(
      KeyGroups,
      `These are "subject :: attribute" keys extracted from many memory files of one company.
Find keys that describe the same real-world property, even when worded differently (synonyms such as ticket/incident, plan/tier, owner/lead, deadline/sla/target, date/launch date).
Do not merge different people, customers, products, plans or priorities (P1 is not P2; Pro is not Starter).

${keys.join("\n")}

Answer as JSON only: an array of groups, each an array of 2+ keys copied exactly from the list. Omit keys that have no match. Example: [["a :: b", "a2 :: b"]]`,
    ).pipe(Effect.catchAll(() => Effect.succeed([] as readonly (readonly string[])[])))
    const canon: Record<string, string> = {}
    for (const g of groupsReply) for (const k of g) if (g[0] && !canon[k]) canon[k] = g[0]

    const groups = new Map<string, Fact[]>()
    // Facts that are explicitly about a past value ("previous date", "former owner") are history, not current claims.
    const PAST = /\b(previous|prior|former|old|original|was)\b/i
    for (const f of facts.filter((x) => !PAST.test(x.attribute))) {
      const k = canon[simpleKey(f)] ?? simpleKey(f)
      groups.set(k, [...(groups.get(k) ?? []), f])
    }
    const candidates = [...groups.entries()].filter(
      ([, fs]) => new Set(fs.map((f) => f.file)).size >= 2 && new Set(fs.map((f) => normValue(f.value))).size >= 2,
    )

    const byPath = new Map(files.map((f) => [f.path, f]))
    const findings: Finding[] = []
    const superseded: { older: Fact; newer: Fact }[] = []
    let judged = 0
    yield* Effect.forEach(
      candidates,
      ([key, fs]) =>
        Effect.gen(function* () {
          // Winner: newest dated value, else the highest scope.
          const scored = fs.map((f) => ({ f, date: parseDate(f.asOf, today), rank: SCOPE_RANK[byPath.get(f.file)!.scope] }))
          const winner = [...scored].sort((a, b) => (b.date?.getTime() ?? -1) - (a.date?.getTime() ?? -1) || b.rank - a.rank)[0]!
          const list = fs
            .map((f, i) => `#${i} [${f.file}, ${byPath.get(f.file)!.scope} scope${f.asOf ? `, as of ${f.asOf}` : ""}] ${f.text}`)
            .join("\n")
          const verdict = yield* askJson(
            Verdict,
            `Statements about "${key}" from different memory files:
${list}

Do these statements genuinely conflict, or is it history, different contexts, or the same fact?
- "conflict": a reader of each file would come away believing different current values. This includes a file that still states an old value as current while another file records that it changed.
- "history": every differing statement is clearly marked as past (dated as superseded, "previously", "was", "moved from").
- "different_context": they are about different subjects, plans or time frames.
- "same": the values agree.
If kind is "conflict": the value to keep is statement #${fs.indexOf(winner.f)} (${winner.date ? "newest dated" : "highest scope"}). For every other statement that disagrees, rewrite its full original line so it matches, changing as little as possible.

Answer as JSON only: {"kind": "conflict" | "history" | "different_context" | "same", "reason": "one sentence", "rewrites": [{"index": 0, "after": "full rewritten line"}]}`,
          ).pipe(Effect.catchAll((e) => Effect.sync(() => (warnings.push(`Skipped group "${key}": ${e.message}`), undefined))))
          progress(`Checking contradictions (${++judged}/${candidates.length})`, 0.6 + 0.35 * (judged / candidates.length))
          if (!verdict) return

          if (verdict.kind === "history") {
            const dated = scored.filter((s) => s.date).sort((a, b) => a.date!.getTime() - b.date!.getTime())
            const newest = dated.at(-1)
            for (const s of dated)
              if (newest && s.f.file !== newest.f.file && !sameValue(s.f.value, newest.f.value))
                superseded.push({ older: s.f, newer: newest.f })
            return
          }
          if (verdict.kind !== "conflict") return

          // Every disagreeing statement is dated and older than the winner: that's a superseded (stale) fact.
          const losers = scored.filter((s) => s !== winner && !sameValue(s.f.value, winner.f.value))
          if (winner.date && losers.length && losers.every((s) => s.date && s.date < winner.date!)) {
            for (const s of losers) if (s.f.file !== winner.f.file) superseded.push({ older: s.f, newer: winner.f })
            return
          }

          const involved = [...new Map(fs.map((f) => [`${f.file}:${f.lineStart}`, f])).values()]
          const evidence = involved.map((f) => evidenceAt(byPath.get(f.file)!, f.lineStart, f.lineEnd))
          const values = [...new Set(fs.map((f) => f.value))]
          const companyInvolved = involved.some((f) => byPath.get(f.file)!.scope === "company")
          findings.push({
            id: findingId("contradiction", evidence),
            check: "contradiction",
            severity: companyInvolved ? "high" : "medium",
            title: `${winner.f.subject} ${winner.f.attribute} differs: ${values.slice(0, 3).join(" vs ")}`,
            explanation: `${verdict.reason} Suggested fix keeps "${winner.f.value}" from ${winner.f.file} (${winner.date ? `newest dated value, ${winner.f.asOf}` : "highest scope, no dates given"}).`,
            evidence,
            suggestedFix: (verdict.rewrites ?? []).flatMap((r) => {
              const f = fs[r.index]
              if (!f || f === winner.f) return []
              return [{ file: f.file, before: byPath.get(f.file)!.lines.slice(f.lineStart - 1, f.lineEnd).join("\n"), after: r.after }]
            }),
          })
        }),
      { concurrency: 12 },
    )
    return { facts, findings, superseded, warnings } satisfies ContradictionResult
  })
