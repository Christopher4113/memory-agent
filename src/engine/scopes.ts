import type { Scope } from "./schema.js"

// Edit these rules to match a real /memories layout. First matching prefix wins.
export const SCOPE_RULES: { prefix: string; scope: Scope; ownerFromSegment?: number }[] = [
  { prefix: "company/", scope: "company" },
  { prefix: "projects/", scope: "project", ownerFromSegment: 1 },
  { prefix: "agents/", scope: "agent", ownerFromSegment: 1 },
  { prefix: "personal/", scope: "personal", ownerFromSegment: 1 },
]

export const scopeFor = (path: string): { scope: Scope; scopeOwner?: string } => {
  const p = path.replace(/^\/?(memories\/)?/, "")
  for (const rule of SCOPE_RULES) {
    if (p.startsWith(rule.prefix)) {
      const owner = rule.ownerFromSegment === undefined ? undefined : p.split("/")[rule.ownerFromSegment]
      return owner ? { scope: rule.scope, scopeOwner: owner } : { scope: rule.scope }
    }
  }
  return { scope: "unknown" }
}

export const SCOPE_RANK: Record<Scope, number> = { company: 4, project: 3, agent: 2, unknown: 1, personal: 0 }
export const isShared = (s: Scope) => s !== "personal"
