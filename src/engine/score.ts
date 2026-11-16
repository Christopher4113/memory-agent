import type { Finding, Severity } from "./schema.js"

export const PENALTY: Record<Severity, number> = { high: 10, medium: 4, low: 1 }
export const SCORE_FORMULA = "100 − 10 per high − 4 per medium − 1 per low (floor 0)"

export const healthScore = (findings: readonly Finding[]) =>
  Math.max(0, 100 - findings.reduce((s, f) => s + PENALTY[f.severity], 0))
