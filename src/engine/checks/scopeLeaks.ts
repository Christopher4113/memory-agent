import { Effect, Schema } from "effect"
import type { Evidence, Finding, MemoryFile } from "../schema.js"
import { askJson, Llm } from "../llm.js"
import { evidenceAt, findingId } from "../util.js"

const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g
const PHONE = /\+?\d[\d\s().-]{8,}\d/g
const ADDRESS = /\b\d{2,5}\s+[A-Z][a-z]+(?:\s[A-Z][a-z]+)*\s(?:St|Street|Ave|Avenue|Rd|Road|Blvd|Lane|Ln|Dr|Drive|Way)\b/
const SENSITIVE =
  /\b(salary|compensation|comp band|equity|offer letter|bonus|doctor|dentist|dermatolog\w*|therap\w*|medical|diagnos\w*|prescription|pregnan\w*|divorce)\b/i
const NGRAM = 8

const words = (s: string) => s.toLowerCase().replace(/[^a-z0-9$\s]/g, " ").split(/\s+/).filter(Boolean)
const grams = (s: string) => {
  const w = words(s)
  const out: string[] = []
  for (let i = 0; i + NGRAM <= w.length; i++) out.push(w.slice(i, i + NGRAM).join(" "))
  return out
}
const phones = (s: string) => [...s.matchAll(PHONE)].map((m) => m[0].replace(/\D/g, "")).filter((d) => d.length >= 10)
const emails = (s: string) => [...s.matchAll(EMAIL)].map((m) => m[0].toLowerCase())

type Hit = { file: MemoryFile; line: number; source?: Evidence; reason: string }

const Verdicts = Schema.Array(Schema.Struct({ id: Schema.Number, personal: Schema.Boolean, reason: Schema.String }))

export const checkScopeLeaks = (files: readonly MemoryFile[]) =>
  Effect.gen(function* () {
    const llm = yield* Llm
    const personal = files.filter((f) => f.scope === "personal")
    const shared = files.filter((f) => f.scope !== "personal")

    // Index personal content: 8-word sequences, phone numbers, emails → where they came from.
    const index = new Map<string, Evidence>()
    for (const f of personal)
      f.lines.forEach((line, i) => {
        const ev = evidenceAt(f, i + 1)
        for (const k of [...grams(line), ...phones(line).map((p) => `tel:${p}`), ...emails(line).map((e) => `mail:${e}`)])
          if (!index.has(k)) index.set(k, ev)
      })

    const strong: Hit[] = []
    const weak: Hit[] = []
    for (const f of shared)
      f.lines.forEach((line, i) => {
        const keys = [...grams(line), ...phones(line).map((p) => `tel:${p}`), ...emails(line).map((e) => `mail:${e}`)]
        const src = keys.map((k) => index.get(k)).find(Boolean)
        if (src) strong.push({ file: f, line: i + 1, source: src, reason: `copied from ${src.file}` })
        else if (SENSITIVE.test(line) || emails(line).length || phones(line).length || ADDRESS.test(line))
          weak.push({ file: f, line: i + 1, reason: "possible personal detail" })
      })

    // LLM only judges the weak candidates; without a key they are dropped (too noisy alone).
    let confirmed: Hit[] = []
    if (llm.enabled && weak.length) {
      const list = weak.map((h, id) => `${id}. [${h.file.path}] ${h.file.lines[h.line - 1]!.trim()}`).join("\n")
      const verdicts = yield* askJson(
        Verdicts,
        `You review lines from a company's shared memory files (readable by every employee and agent).
For each line, decide: is this personal information about a specific individual that shouldn't be shared company-wide?
Personal means things like a private phone number, home address, medical details, compensation, or private life events.
Business contact details used in a work capacity (customer emails, work phone numbers, team aliases) and general company policy are NOT personal.

${list}

Answer as JSON only: [{"id": number, "personal": boolean, "reason": "short reason"}]`,
      ).pipe(Effect.catchAll(() => Effect.succeed([] as typeof Verdicts.Type)))
      confirmed = verdicts.flatMap((v) => (v.personal && weak[v.id] ? [{ ...weak[v.id]!, reason: v.reason }] : []))
    }

    const byFile = new Map<string, Hit[]>()
    for (const h of [...strong, ...confirmed]) byFile.set(h.file.path, [...(byFile.get(h.file.path) ?? []), h])

    return [...byFile.values()].map((hits): Finding => {
      const file = hits[0]!.file
      const sources = [...new Map(hits.flatMap((h) => (h.source ? [[`${h.source.file}:${h.source.lineStart}`, h.source]] : []))).values()]
      const evidence = [...hits.map((h) => evidenceAt(h.file, h.line)), ...sources]
      const owners = [...new Set(sources.map((s) => s.file.split("/").slice(0, 2).join("/")))]
      return {
        id: findingId("scope_leak", evidence),
        check: "scope_leak",
        severity: "high",
        title: owners.length
          ? `Personal info from ${owners.join(", ")} copied into ${file.path}`
          : `Personal info in shared file ${file.path}`,
        explanation: `${hits.length} line${hits.length > 1 ? "s" : ""} in ${file.scope} scope ${hits.length > 1 ? "look" : "looks"} personal (${[...new Set(hits.map((h) => h.reason))].join("; ")}). Everyone and every agent can read this scope.`,
        evidence,
        suggestedFix: hits.map((h) => ({ file: file.path, before: h.file.lines[h.line - 1]!, after: "" })),
      }
    })
  })
