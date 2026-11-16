import type { Finding, MemoryFile } from "../schema.js"
import { SCOPE_RANK } from "../scopes.js"
import { evidenceAt, findingId, stripDates } from "../util.js"

export const DUP_THRESHOLD = 0.8
const MIN_TOKENS = 6

type Unit = { file: MemoryFile; line: number; tokens: Set<string> }

export const normalizeTokens = (text: string) =>
  stripDates(text.toLowerCase())
    .replace(/[*_`#>[\]()]/g, " ")
    .replace(/[^a-z0-9$%\s]/g, "")
    .split(/\s+/)
    .filter(Boolean)

// Word-shingle (k=1) Jaccard: robust to small rewording and reordering.
const jaccard = (a: Set<string>, b: Set<string>) => {
  let inter = 0
  for (const t of a) if (b.has(t)) inter++
  return inter / (a.size + b.size - inter)
}

const units = (files: readonly MemoryFile[]): Unit[] =>
  files
    .filter((f) => f.scope !== "personal") // personal → shared copies are scope leaks, not duplicates
    .flatMap((file) =>
      file.lines.flatMap((raw, i) => {
        const line = raw.trim()
        if (!line || line.startsWith("#") || line.startsWith("|")) return []
        const tokens = new Set(normalizeTokens(line))
        return tokens.size >= MIN_TOKENS ? [{ file, line: i + 1, tokens }] : []
      }),
    )

export const checkDuplicates = (files: readonly MemoryFile[]): Finding[] => {
  const us = units(files)
  const parent = us.map((_, i) => i)
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i]!)))
  // ponytail: O(n²) pair scan, fine to a few thousand lines; use MinHash/LSH beyond that.
  for (let i = 0; i < us.length; i++)
    for (let j = i + 1; j < us.length; j++)
      if (us[i]!.file.path !== us[j]!.file.path && jaccard(us[i]!.tokens, us[j]!.tokens) >= DUP_THRESHOLD)
        parent[find(i)] = find(j)

  const clusters = new Map<number, Unit[]>()
  us.forEach((u, i) => clusters.set(find(i), [...(clusters.get(find(i)) ?? []), u]))

  return [...clusters.values()]
    .filter((c) => new Set(c.map((u) => u.file.path)).size >= 2)
    .map((cluster) => {
      const sorted = [...cluster].sort((a, b) => SCOPE_RANK[b.file.scope] - SCOPE_RANK[a.file.scope] || a.file.path.localeCompare(b.file.path))
      const keep = sorted[0]!
      const evidence = sorted.map((u) => evidenceAt(u.file, u.line))
      const text = keep.file.lines[keep.line - 1]!.trim().replace(/^[-*]\s+/, "")
      return {
        id: findingId("duplicate", evidence),
        check: "duplicate" as const,
        severity: "low" as const,
        title: `Same fact in ${sorted.length} files: "${text.length > 60 ? `${text.slice(0, 57)}…` : text}"`,
        explanation: `This statement appears in ${sorted.map((u) => u.file.path).join(", ")}. Copies drift apart over time; keep it in ${keep.file.path} (highest scope) and link to it from the others.`,
        evidence,
        suggestedFix: sorted.slice(1).map((u) => {
          const before = u.file.lines[u.line - 1]!
          const bullet = before.match(/^\s*([-*]|\d+\.)\s+/)?.[0] ?? ""
          return { file: u.file.path, before, after: `${bullet}See ${keep.file.path}.` }
        }),
      }
    })
}
