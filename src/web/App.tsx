import { useCallback, useEffect, useRef, useState } from "react"
import { Database, Play, Upload } from "lucide-react"
import { api, streamAudit, type AuditInput, type AuditRun, type Meta, type RunSummary } from "@/api"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { AuditView } from "@/components/audit-view"
import { HistoryView } from "@/components/history-view"
import { ResultsView } from "@/components/results-view"
import { Empty, ErrorNote, Loading } from "@/components/shared"

type Tab = "audit" | "history" | "results"

const sourceLabel = (s: AuditInput) => (s.kind === "zip" ? s.file.name : "Northwind demo")

export const App = () => {
  const [meta, setMeta] = useState<Meta | undefined>()
  const [runs, setRuns] = useState<RunSummary[] | undefined>()
  const [run, setRun] = useState<AuditRun | undefined>()
  const [tab, setTab] = useState<Tab>("audit")
  const [source, setSource] = useState<AuditInput>({ kind: "fixture", snapshot: "current" })
  const [progress, setProgress] = useState<{ step: string; pct: number } | undefined>()
  const [loadingRun, setLoadingRun] = useState(false)
  const [error, setError] = useState<string | undefined>()
  const fileInput = useRef<HTMLInputElement>(null)

  const openRun = useCallback((id: number) => {
    setLoadingRun(true)
    setError(undefined)
    api
      .run(id)
      .then(setRun, (e: Error) => setError(e.message))
      .finally(() => setLoadingRun(false))
  }, [])

  const refreshRuns = useCallback(() => api.runs().then((r) => (setRuns(r), r)), [])

  useEffect(() => {
    api.meta().then(setMeta, () => {})
    refreshRuns().then(
      (r) => r[0] && openRun(r[0].id),
      (e: Error) => (setRuns([]), setError(e.message)),
    )
  }, [refreshRuns, openRun])

  const runAudit = async () => {
    setError(undefined)
    setProgress({ step: "Starting audit", pct: 0.02 })
    try {
      const result = await streamAudit(source, (step, pct) => setProgress({ step, pct }))
      setRun(result)
      setTab((t) => (t === "results" && !result.source.startsWith("fixture:current") ? "audit" : t))
      await refreshRuns()
    } catch (e) {
      setError(e instanceof Error ? e.message : "The audit failed.")
    } finally {
      setProgress(undefined)
    }
  }

  const busy = progress !== undefined
  const llmSkipped = run ? !run.llmEnabled : meta ? !meta.llmEnabled : false

  return (
    <div className="flex h-screen flex-col">
      {/* thin progress bar */}
      <div className="h-0.5 w-full bg-transparent" aria-hidden>
        {busy && <div className="h-full bg-accent transition-[width] duration-300" style={{ width: `${Math.round(progress.pct * 100)}%` }} />}
      </div>

      <header className="flex items-center gap-3 border-b border-hairline px-8 py-4">
        <h1 className="font-serif text-[40px] leading-none tracking-tight">Memory Audit</h1>
        <select
          aria-label="Select run"
          className="ml-4 h-9 max-w-64 rounded-[var(--radius-button)] border border-border bg-surface px-2 text-sm"
          value={run?.id ?? ""}
          onChange={(e) => openRun(Number(e.target.value))}
          disabled={!runs?.length}
        >
          {!runs?.length && <option value="">No runs yet</option>}
          {runs?.map((r) => (
            <option key={r.id} value={r.id}>
              Run #{r.id} · {r.label}
            </option>
          ))}
        </select>
        <div className="ml-auto flex items-center gap-2">
          <span className="mr-1 flex items-center gap-1.5 text-sm text-muted">
            <Database className="size-4 text-subtle" />
            {sourceLabel(source)}
            {source.kind === "fixture" && (
              <select
                aria-label="Demo snapshot"
                className="h-7 rounded-[var(--radius-button)] border border-border bg-surface px-1.5 text-xs"
                value={source.snapshot}
                onChange={(e) => setSource({ kind: "fixture", snapshot: e.target.value === "earlier" ? "earlier" : "current" })}
              >
                <option value="earlier">week 1</option>
                <option value="current">week 2</option>
              </select>
            )}
          </span>
          <Button variant="secondary" onClick={() => setSource({ kind: "fixture", snapshot: "current" })} disabled={busy}>
            Load demo (Northwind)
          </Button>
          <Button variant="secondary" onClick={() => fileInput.current?.click()} disabled={busy}>
            <Upload /> Upload .zip
          </Button>
          <input
            ref={fileInput}
            type="file"
            accept=".zip,application/zip"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) setSource({ kind: "zip", file: f })
              e.target.value = ""
            }}
          />
          <Button variant="primary" onClick={() => void runAudit()} disabled={busy}>
            <Play /> {busy ? "Running…" : "Run audit"}
          </Button>
        </div>
      </header>

      <div className="flex items-center gap-6 border-b border-hairline px-8">
        {(["audit", "history", "results"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn("-mb-px border-b-2 py-2.5 text-sm", tab === t ? "border-text text-text" : "border-transparent text-subtle hover:text-text")}
          >
            {t === "audit" ? "Audit" : t === "history" ? "Run history" : "Results"}
          </button>
        ))}
        {busy && <span className="ml-auto text-sm text-muted">{progress.step}…</span>}
      </div>

      <main className="flex min-h-0 flex-1 flex-col gap-3 px-8 py-5">
        {error && <ErrorNote>{error}</ErrorNote>}
        {llmSkipped && (
          <div className="rounded-[var(--radius-base)] border border-warning/40 bg-[#fdf8ec] px-3 py-2 text-sm text-warning">
            LLM checks skipped: add ANTHROPIC_API_KEY.
          </div>
        )}
        {runs === undefined ? (
          <Loading />
        ) : tab === "history" ? (
          <HistoryView runs={runs} onOpen={(id) => (openRun(id), setTab("audit"))} />
        ) : !run ? (
          loadingRun ? (
            <Loading />
          ) : (
            <Empty title="No audits yet">Click “Load demo (Northwind)”, then “Run audit”. Or upload a .zip export of your /memories folder.</Empty>
          )
        ) : tab === "results" ? (
          <ResultsView run={run} />
        ) : (
          <AuditView run={run} runs={runs} formula={meta?.scoreFormula ?? "100 − 10 per high − 4 per medium − 1 per low (floor 0)"} />
        )}
      </main>

      <footer className="border-t border-hairline px-8 py-2 text-xs text-subtle">
        Independent prototype by Christopher Lam, not affiliated with The Company Company.
      </footer>
    </div>
  )
}
