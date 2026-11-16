import { useEffect, useState } from "react"
import { ArrowRight } from "lucide-react"
import { api, type Diff, type Finding, type RunSummary } from "@/api"
import { Card } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { CHECK_LABEL, Empty, ErrorNote, Loading, ScopeTag, scopesOf, SectionTitle, SeverityDot } from "./shared"

const fmt = (iso: string) => new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
const healthColor = (n: number) => (n >= 80 ? "text-primary" : n >= 50 ? "text-warning" : "text-danger")

const RunSelect = ({ runs, value, onChange, label }: { runs: RunSummary[]; value: number; onChange: (n: number) => void; label: string }) => (
  <label className="flex flex-col gap-1 text-xs text-subtle">
    {label}
    <select
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="h-9 rounded-[var(--radius-button)] border border-border bg-surface px-2 text-sm text-text"
    >
      {runs.map((r) => (
        <option key={r.id} value={r.id}>
          #{r.id} · {r.label} · {r.healthScore}
        </option>
      ))}
    </select>
  </label>
)

const FindingRows = ({ items, tone }: { items: Finding[]; tone: "added" | "resolved" }) =>
  items.length === 0 ? (
    <p className="px-3 py-4 text-sm text-subtle">None</p>
  ) : (
    <ul>
      {items.map((f) => (
        <li key={f.id} className="flex items-start gap-2 border-b border-hairline px-3 py-2 last:border-b-0">
          <SeverityDot severity={f.severity} className="mt-1.5" />
          <div className="min-w-0 flex-1">
            <div className={cn("text-sm", tone === "resolved" && "text-subtle line-through decoration-primary/60")}>{f.title}</div>
            <div className="mt-1 flex flex-wrap items-center gap-1">
              {scopesOf(f).map((s) => (
                <ScopeTag key={s} scope={s} />
              ))}
              <span className="ml-auto text-xs text-subtle">{CHECK_LABEL[f.check]}</span>
            </div>
          </div>
        </li>
      ))}
    </ul>
  )

export const HistoryView = ({ runs, onOpen }: { runs: RunSummary[]; onOpen: (id: number) => void }) => {
  const [a, setA] = useState<number | undefined>(runs[1]?.id)
  const [b, setB] = useState<number | undefined>(runs[0]?.id)
  const [diff, setDiff] = useState<Diff | undefined>()
  const [error, setError] = useState<string | undefined>()

  useEffect(() => {
    setA((x) => x ?? runs[1]?.id)
    setB((x) => x ?? runs[0]?.id)
  }, [runs])

  useEffect(() => {
    if (a === undefined || b === undefined) return
    setDiff(undefined)
    setError(undefined)
    api.diff(a, b).then(setDiff, (e: Error) => setError(e.message))
  }, [a, b])

  if (!runs.length) return <Empty title="No runs yet">Run an audit to start the history.</Empty>
  return (
    <div className="grid min-h-0 flex-1 grid-cols-[minmax(360px,420px)_1fr] gap-6">
      <div className="min-h-0 overflow-y-auto">
        <SectionTitle className="mb-3">Runs</SectionTitle>
        <Card>
          <ul>
            {runs.map((r) => (
              <li key={r.id} className="border-b border-hairline last:border-b-0">
                <button onClick={() => onOpen(r.id)} className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-[#f7f7f6]">
                  <span className={cn("w-10 font-serif text-2xl tabular-nums", healthColor(r.healthScore))}>{r.healthScore}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">
                      #{r.id} · {r.label}
                    </span>
                    <span className="block text-xs text-subtle">
                      {fmt(r.createdAt)} · {r.fileCount} files · {Object.values(r.counts).reduce((s, n) => s + n, 0)} findings
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </Card>
      </div>
      <div className="flex min-h-0 flex-col">
        <SectionTitle className="mb-3">Compare</SectionTitle>
        {runs.length < 2 ? (
          <Empty title="One run so far">Run a second audit (for example Northwind week 1, then week 2) to compare.</Empty>
        ) : (
          <>
            <div className="mb-4 flex items-end gap-3">
              <RunSelect runs={runs} value={a ?? runs[1]!.id} onChange={setA} label="Before" />
              <ArrowRight className="mb-2.5 size-4 text-subtle" />
              <RunSelect runs={runs} value={b ?? runs[0]!.id} onChange={setB} label="After" />
              {diff && (
                <p className="mb-2 ml-4 text-sm text-muted">
                  <span className="text-danger tabular-nums">+{diff.added.length} added</span> ·{" "}
                  <span className="text-primary tabular-nums">{diff.resolved.length} resolved</span> ·{" "}
                  <span className="tabular-nums">{diff.unchanged} unchanged</span>
                </p>
              )}
            </div>
            {error ? (
              <ErrorNote>{error}</ErrorNote>
            ) : !diff ? (
              <Loading label="Comparing" />
            ) : (
              <div className="grid min-h-0 flex-1 grid-cols-2 gap-4">
                <Card className="flex min-h-0 flex-col">
                  <div className="border-b border-hairline px-3 py-2 text-sm font-medium text-danger">Added in #{diff.b}</div>
                  <div className="min-h-0 overflow-y-auto">
                    <FindingRows items={diff.added} tone="added" />
                  </div>
                </Card>
                <Card className="flex min-h-0 flex-col">
                  <div className="border-b border-hairline px-3 py-2 text-sm font-medium text-primary">Resolved since #{diff.a}</div>
                  <div className="min-h-0 overflow-y-auto">
                    <FindingRows items={diff.resolved} tone="resolved" />
                  </div>
                </Card>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
