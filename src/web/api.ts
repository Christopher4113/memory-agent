import type { AuditRun, CheckType, Finding, Scope, Severity } from "../engine/schema"
import type { Evaluation } from "../engine/evaluate"

export type { AuditRun, CheckType, Finding, Scope, Severity, Evaluation }
export type RunSummary = Omit<AuditRun, "findings">
export type Diff = { a: number; b: number; added: Finding[]; resolved: Finding[]; unchanged: number }
export type Results = ({ applicable: true } & Evaluation) | { applicable: false }
export type Meta = { llmEnabled: boolean; model: string; scoreFormula: string }

const get = async <T>(url: string): Promise<T> => {
  const res = await fetch(url)
  const body = (await res.json().catch(() => ({ error: "The server is not responding. Is `pnpm dev` running?" }))) as T & { error?: string }
  if (!res.ok || body.error) throw new Error(body.error ?? `Request failed (${res.status})`)
  return body
}

export const api = {
  meta: () => get<Meta>("/api/meta"),
  runs: () => get<RunSummary[]>("/api/runs"),
  run: (id: number) => get<AuditRun>(`/api/runs/${id}`),
  files: (id: number) => get<{ path: string; scope: Scope }[]>(`/api/runs/${id}/files`),
  file: (run: number, path: string) => get<{ path: string; scope: Scope; content: string }>(`/api/files?run=${run}&path=${encodeURIComponent(path)}`),
  diff: (a: number, b: number) => get<Diff>(`/api/diff?a=${a}&b=${b}`),
  results: (id: number) => get<Results>(`/api/runs/${id}/results`),
}

export type AuditInput = { kind: "fixture"; snapshot: "current" | "earlier" } | { kind: "zip"; file: File }

// POST, then read the SSE body as it streams (EventSource can't POST or upload).
export const streamAudit = async (input: AuditInput, onProgress: (step: string, pct: number) => void): Promise<AuditRun> => {
  const init: RequestInit =
    input.kind === "zip"
      ? { method: "POST", body: (() => { const f = new FormData(); f.append("file", input.file); return f })() }
      : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ source: "fixture", snapshot: input.snapshot }) }
  const res = await fetch("/api/audit/stream", init)
  if (!res.ok || !res.body) throw new Error("Could not start the audit. Is the server running?")
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader()
  let buf = ""
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buf += value
    let idx: number
    while ((idx = buf.indexOf("\n\n")) >= 0) {
      const chunk = buf.slice(0, idx)
      buf = buf.slice(idx + 2)
      const event = chunk.match(/^event: (.*)$/m)?.[1]
      const data = chunk.match(/^data: (.*)$/m)?.[1]
      if (!event || !data) continue
      const parsed = JSON.parse(data) as { step: string; pct: number } & { error: string } & AuditRun
      if (event === "progress") onProgress(parsed.step, parsed.pct)
      if (event === "error") throw new Error(parsed.error)
      if (event === "done") return parsed
    }
  }
  throw new Error("The audit stream ended early.")
}
