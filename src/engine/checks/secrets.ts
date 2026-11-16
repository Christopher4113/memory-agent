import type { Finding, MemoryFile } from "../schema.js"
import { evidenceAt, findingId } from "../util.js"

const PATTERNS: { name: string; re: RegExp }[] = [
  { name: "Anthropic API key", re: /sk-ant-[A-Za-z0-9_-]{20,}/g },
  { name: "OpenAI-style API key", re: /\bsk-(?!ant-)[A-Za-z0-9_-]{20,}/g },
  { name: "GitHub token", re: /\b(?:ghp|gho|ghs|ghu)_[A-Za-z0-9]{20,}|\bgithub_pat_[A-Za-z0-9_]{20,}/g },
  { name: "Slack token", re: /\bxox[baprs]-[A-Za-z0-9-]{10,}/g },
  { name: "AWS access key", re: /\bAKIA[0-9A-Z]{16}\b/g },
  { name: "Private key", re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g },
]

const entropy = (s: string) => {
  const freq = new Map<string, number>()
  for (const c of s) freq.set(c, (freq.get(c) ?? 0) + 1)
  let h = 0
  for (const n of freq.values()) h -= (n / s.length) * Math.log2(n / s.length)
  return h
}

// Long random-looking tokens: letters + digits, 32+ chars, high entropy.
const TOKEN_RE = /[A-Za-z0-9_\-+/=]{32,}/g
const looksRandom = (t: string) => /[a-z]/.test(t) && /[A-Z]/.test(t) && /\d/.test(t) && entropy(t) > 4.2

export const mask = (secret: string) => (secret.length <= 12 ? "****" : `${secret.slice(0, 6)}…${secret.slice(-4)}`)

export const findSecretsInText = (text: string): { name: string; value: string }[] => {
  const hits: { name: string; value: string }[] = []
  for (const { name, re } of PATTERNS) for (const m of text.matchAll(re)) hits.push({ name, value: m[0] })
  for (const m of text.matchAll(TOKEN_RE))
    if (looksRandom(m[0]) && !hits.some((h) => h.value.includes(m[0]) || m[0].includes(h.value)))
      hits.push({ name: "High-entropy token", value: m[0] })
  return hits
}

export const maskText = (text: string) => {
  let out = text
  for (const h of findSecretsInText(text)) out = out.split(h.value).join(mask(h.value))
  return out
}

export const maskFile = (f: MemoryFile): MemoryFile => {
  const content = maskText(f.content)
  return content === f.content ? f : { ...f, content, lines: content.split("\n") }
}

// Runs on raw files; every snippet it emits is already masked.
export const checkSecrets = (files: readonly MemoryFile[]): Finding[] =>
  files.flatMap((f) =>
    f.lines.flatMap((line, i) => {
      const hits = findSecretsInText(line)
      if (!hits.length) return []
      const masked = maskText(line)
      const ev = { ...evidenceAt(f, i + 1), snippet: masked }
      let after = line
      for (const h of hits) after = after.split(h.value).join("<stored in workspace secrets>")
      const evidence = [ev]
      return [
        {
          id: findingId("secret", evidence),
          check: "secret" as const,
          severity: "high" as const,
          title: `${hits[0]!.name} pasted into ${f.path}`,
          explanation: `Line ${i + 1} contains ${hits.map((h) => `${h.name} (${mask(h.value)})`).join(", ")}. Every agent that reads this scope can see it; move it to the workspace secrets store and rotate it.`,
          evidence,
          suggestedFix: [{ file: f.path, before: masked, after }],
        },
      ]
    }),
  )
