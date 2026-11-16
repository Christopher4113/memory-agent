import { useEffect, useMemo, useState } from "react"
import { Check, ChevronDown, ChevronRight, Copy, FileText, Info } from "lucide-react"
import { api, type AuditRun, type CheckType, type Finding, type RunSummary, type Scope } from "@/api"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { CHECK_LABEL, CHECK_PLURAL, Empty, ErrorNote, Loading, ScopeTag, scopesOf, SeverityDot } from "./shared"

const CHECKS: CheckType[] = ["contradiction", "stale", "duplicate", "scope_leak", "secret"]
const CHIP_LABEL: Record<CheckType | "all", string> = {
  all: "All",
  contradiction: "Contradictions",
  stale: "Stale",
  duplicate: "Duplicates",
  scope_leak: "Scope leaks",
  secret: "Secrets",
}

/* ---------- Summary row ---------- */

const healthColor = (n: number) => (n >= 80 ? "text-primary" : n >= 50 ? "text-warning" : "text-danger")

export const SummaryRow = ({ run, previous, formula }: { run: AuditRun; previous: AuditRun | undefined; formula: string }) => {
  const sev = { high: 0, medium: 0, low: 0 }
  for (const f of run.findings) sev[f.severity]++
  const deltas = previous
    ? CHECKS.map((c) => ({ c, d: run.counts[c] - previous.counts[c] })).filter((x) => x.d !== 0).sort((a, b) => Math.abs(b.d) - Math.abs(a.d))
    : []
  return (
    <div className="grid grid-cols-4 gap-3">
      <Card className="px-4 py-3">
        <div className="flex items-center gap-1.5 text-xs text-subtle">
          Health score
          <span className="group relative">
            <Info className="size-3.5" aria-label="How the score is computed" tabIndex={0} />
            <span className="pointer-events-none absolute top-5 left-0 z-20 w-64 rounded-[var(--radius-base)] border border-border bg-surface p-2 text-xs text-muted opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
              {formula}
            </span>
          </span>
        </div>
        <div className={cn("font-serif text-[44px] leading-none tabular-nums", healthColor(run.healthScore))}>{run.healthScore}</div>
      </Card>
      <Card className="px-4 py-3">
        <div className="text-xs text-subtle">Scanned</div>
        <div className="mt-1 text-2xl tabular-nums">
          {run.fileCount} <span className="text-sm text-subtle">files</span>
        </div>
        <div className="text-sm text-muted tabular-nums">{run.llmEnabled ? `${run.factCount} facts extracted` : "Fact extraction skipped"}</div>
      </Card>
      <Card className="px-4 py-3">
        <div className="text-xs text-subtle">Findings by severity</div>
        <div className="mt-2 flex items-center gap-4 text-sm">
          {(["high", "medium", "low"] as const).map((s) => (
            <span key={s} className="flex items-center gap-1.5">
              <SeverityDot severity={s} />
              <span className="text-2xl tabular-nums">{sev[s]}</span>
              <span className="text-subtle">{s}</span>
            </span>
          ))}
        </div>
      </Card>
      <Card className="px-4 py-3">
        <div className="text-xs text-subtle">vs. previous run{previous ? ` (#${previous.id})` : ""}</div>
        {!previous ? (
          <div className="mt-2 text-sm text-subtle">First run. Nothing to compare yet.</div>
        ) : deltas.length === 0 ? (
          <div className="mt-2 text-sm text-primary">No change in findings</div>
        ) : (
          <ul className="mt-1 space-y-0.5 text-sm">
            {deltas.slice(0, 3).map(({ c, d }) => (
              <li key={c} className={d > 0 ? "text-danger" : "text-primary"}>
                <span className="tabular-nums">{d > 0 ? `+${d}` : d}</span> {CHECK_PLURAL[c]}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}

/* ---------- Scope tree ---------- */

const SCOPE_ORDER: { scope: Scope; label: string }[] = [
  { scope: "company", label: "Company" },
  { scope: "project", label: "Projects" },
  { scope: "agent", label: "Agents" },
  { scope: "personal", label: "Personal" },
  { scope: "unknown", label: "Other" },
]

export const ScopeTree = ({
  files,
  findings,
  selected,
  onSelect,
}: {
  files: { path: string; scope: Scope }[]
  findings: readonly Finding[]
  selected: string | undefined
  onSelect: (p: string | undefined) => void
}) => {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const counts = useMemo(() => {
    const m = new Map<string, number>()
    for (const f of findings) for (const p of new Set(f.evidence.map((e) => e.file))) m.set(p, (m.get(p) ?? 0) + 1)
    return m
  }, [findings])
  return (
    <nav aria-label="Memory files by scope" className="text-sm">
      {SCOPE_ORDER.map(({ scope, label }) => {
        const group = files.filter((f) => f.scope === scope)
        if (!group.length) return null
        const open = !collapsed[scope]
        return (
          <div key={scope} className="mb-2">
            <button
              className="flex w-full items-center gap-1 rounded px-1 py-1 text-left font-medium hover:bg-[#f0f0ee]"
              onClick={() => setCollapsed((c) => ({ ...c, [scope]: open }))}
              aria-expanded={open}
            >
              {open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
              {label}
              <ScopeTag scope={scope} />
              <span className="ml-auto text-xs text-subtle tabular-nums">{group.length}</span>
            </button>
            {open && (
              <ul className="mt-0.5">
                {group.map((f) => {
                  const n = counts.get(f.path) ?? 0
                  const short = scope === "unknown" ? f.path : f.path.split("/").slice(1).join("/")
                  return (
                    <li key={f.path}>
                      <button
                        onClick={() => onSelect(selected === f.path ? undefined : f.path)}
                        className={cn(
                          "flex w-full items-center gap-1.5 rounded py-1 pr-1 pl-5 text-left hover:bg-[#f0f0ee]",
                          selected === f.path && "bg-secondary hover:bg-secondary",
                        )}
                        title={f.path}
                      >
                        <FileText className="size-3.5 shrink-0 text-subtle" />
                        <span className="truncate">{short}</span>
                        {n > 0 && (
                          <Badge variant="count" className="ml-auto">
                            {n}
                          </Badge>
                        )}
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        )
      })}
    </nav>
  )
}

/* ---------- Findings list ---------- */

export const FindingsList = ({
  findings,
  filter,
  onFilter,
  selectedId,
  onSelect,
  fileFilter,
  onClearFile,
}: {
  findings: readonly Finding[]
  filter: CheckType | "all"
  onFilter: (f: CheckType | "all") => void
  selectedId: string | undefined
  onSelect: (id: string) => void
  fileFilter: string | undefined
  onClearFile: () => void
}) => {
  const byFile = fileFilter ? findings.filter((f) => f.evidence.some((e) => e.file === fileFilter)) : findings
  const shown = filter === "all" ? byFile : byFile.filter((f) => f.check === filter)
  const chips: (CheckType | "all")[] = ["all", ...CHECKS]
  return (
    <div className="flex min-h-0 flex-col">
      <div className="flex flex-wrap gap-1.5 pb-2">
        {chips.map((c) => {
          const n = c === "all" ? byFile.length : byFile.filter((f) => f.check === c).length
          return (
            <button
              key={c}
              data-testid={`chip-${c}`}
              onClick={() => onFilter(c)}
              aria-pressed={filter === c}
              className={cn(
                "rounded-full border px-2.5 py-0.5 text-xs transition-colors",
                filter === c ? "border-text bg-text text-white" : "border-border bg-surface text-muted hover:bg-[#f4f4f3]",
              )}
            >
              {CHIP_LABEL[c]}{" "}
              <span className="tabular-nums opacity-70">{n}</span>
            </button>
          )
        })}
      </div>
      {fileFilter && (
        <div className="mb-2 flex items-center gap-2 text-xs text-muted">
          Filtered to <code className="rounded bg-secondary px-1">{fileFilter}</code>
          <button className="text-accent underline" onClick={onClearFile}>
            clear
          </button>
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto rounded-[var(--radius-base)] border border-border bg-surface">
        {shown.length === 0 ? (
          <Empty title="Nothing here">No findings match this filter.</Empty>
        ) : (
          <ul>
            {shown.map((f) => (
              <li key={f.id} className="border-b border-hairline last:border-b-0">
                <button
                  data-testid="finding"
                  data-title={f.title}
                  onClick={() => onSelect(f.id)}
                  className={cn("flex w-full flex-col gap-1 px-3 py-2.5 text-left hover:bg-[#f7f7f6]", selectedId === f.id && "bg-secondary hover:bg-secondary")}
                >
                  <span className="flex items-start gap-2">
                    <SeverityDot severity={f.severity} className="mt-1.5" />
                    <span className="text-sm leading-snug">{f.title}</span>
                  </span>
                  <span className="flex flex-wrap items-center gap-1 pl-4">
                    {scopesOf(f).map((s) => (
                      <ScopeTag key={s} scope={s} />
                    ))}
                    <span className="ml-auto text-xs text-subtle">{CHECK_LABEL[f.check]}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

/* ---------- Finding detail ---------- */

const CONTEXT = 3

const Excerpt = ({ runId, ev }: { runId: number; ev: Finding["evidence"][number] }) => {
  const [content, setContent] = useState<string | undefined>()
  const [error, setError] = useState<string | undefined>()
  useEffect(() => {
    let live = true
    setContent(undefined)
    setError(undefined)
    api.file(runId, ev.file).then((r) => live && setContent(r.content), (e: Error) => live && setError(e.message))
    return () => {
      live = false
    }
  }, [runId, ev.file])
  const lines = content?.split("\n") ?? []
  const from = Math.max(1, ev.lineStart - CONTEXT)
  const to = Math.min(lines.length, ev.lineEnd + CONTEXT)
  return (
    <Card className="min-w-0 overflow-hidden">
      <div className="flex items-center gap-2 border-b border-hairline px-3 py-1.5 text-xs">
        <ScopeTag scope={ev.scope} />
        <span className="truncate font-mono text-muted" title={ev.file}>
          {ev.file}
        </span>
        <span className="ml-auto shrink-0 text-subtle">
          L{ev.lineStart}
          {ev.lineEnd !== ev.lineStart ? `–${ev.lineEnd}` : ""}
        </span>
      </div>
      {error ? (
        <div className="p-2">
          <ErrorNote>{error}</ErrorNote>
        </div>
      ) : content === undefined ? (
        <Loading />
      ) : (
        <pre className="overflow-x-auto py-1 font-mono text-[12px] leading-5">
          {lines.slice(from - 1, to).map((l, i) => {
            const n = from + i
            const hit = n >= ev.lineStart && n <= ev.lineEnd
            return (
              <div key={n} className={cn("flex", hit && "bg-secondary")}>
                <span className="w-9 shrink-0 pr-2 text-right text-subtle select-none">{n}</span>
                <span className="pr-3 whitespace-pre-wrap break-words">{l || " "}</span>
              </div>
            )
          })}
        </pre>
      )}
    </Card>
  )
}

const fixText = (f: Finding) =>
  f.suggestedFix
    .map((e) => `--- ${e.file}\n+++ ${e.file}\n${e.before.split("\n").map((l) => `-${l}`).join("\n")}${e.after ? `\n${e.after.split("\n").map((l) => `+${l}`).join("\n")}` : ""}`)
    .join("\n\n")

// Clipboard API first; the textarea fallback covers pages without clipboard permission.
const copyText = async (text: string): Promise<boolean> => {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    const ta = document.createElement("textarea")
    ta.value = text
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand("copy")
    ta.remove()
    return ok
  }
}

export const FindingDetail = ({ runId, finding }: { runId: number; finding: Finding | undefined }) => {
  const [copied, setCopied] = useState(false)
  useEffect(() => setCopied(false), [finding?.id])
  if (!finding) return <Empty title="Select a finding">Evidence from every file involved and a suggested fix show up here.</Empty>
  return (
    <div className="space-y-4">
      <div>
        <div className="mb-1 flex items-center gap-2 text-xs text-subtle">
          <SeverityDot severity={finding.severity} />
          {finding.severity} · {CHECK_LABEL[finding.check]}
        </div>
        <h3 className="font-serif text-2xl leading-tight">{finding.title}</h3>
        <p className="mt-2 text-sm leading-relaxed text-muted">{finding.explanation}</p>
      </div>
      <div>
        <div className="mb-1.5 text-xs font-medium tracking-wide text-subtle uppercase">Evidence</div>
        <div className={cn("grid gap-2", finding.evidence.length > 1 ? "grid-cols-2" : "grid-cols-1")}>
          {finding.evidence.map((ev) => (
            <Excerpt key={`${ev.file}:${ev.lineStart}`} runId={runId} ev={ev} />
          ))}
        </div>
      </div>
      <div>
        <div className="mb-1.5 flex items-center">
          <span className="text-xs font-medium tracking-wide text-subtle uppercase">Suggested fix</span>
          {finding.suggestedFix.length > 0 && (
            <Button
              size="sm"
              variant="secondary"
              className="ml-auto"
              onClick={() => void copyText(fixText(finding)).then(setCopied)}
            >
              {copied ? <Check /> : <Copy />} {copied ? "Copied" : "Copy fix"}
            </Button>
          )}
        </div>
        {finding.suggestedFix.length === 0 ? (
          <p className="text-sm text-subtle">No automatic edit; review the evidence and update the files by hand.</p>
        ) : (
          <div className="space-y-2">
            {finding.suggestedFix.map((e, i) => (
              <Card key={i} className="overflow-hidden">
                <div className="border-b border-hairline px-3 py-1.5 font-mono text-xs text-muted">{e.file}</div>
                <pre className="font-mono text-[12px] leading-5">
                  {e.before.split("\n").map((l, j) => (
                    <div key={`b${j}`} className="flex bg-del text-[#82071e]">
                      <span className="w-6 shrink-0 text-center select-none">-</span>
                      <span className="pr-3 whitespace-pre-wrap break-words">{l}</span>
                    </div>
                  ))}
                  {e.after
                    ? e.after.split("\n").map((l, j) => (
                        <div key={`a${j}`} className="flex bg-add text-[#116329]">
                          <span className="w-6 shrink-0 text-center select-none">+</span>
                          <span className="pr-3 whitespace-pre-wrap break-words">{l}</span>
                        </div>
                      ))
                    : null}
                </pre>
              </Card>
            ))}
            <p className="text-xs text-subtle">Proposed edit only. Memory is never changed automatically.</p>
          </div>
        )}
      </div>
    </div>
  )
}

/* ---------- Audit tab ---------- */

export const AuditView = ({ run, runs, formula }: { run: AuditRun; runs: RunSummary[]; formula: string }) => {
  const [files, setFiles] = useState<{ path: string; scope: Scope }[] | undefined>()
  const [filesError, setFilesError] = useState<string | undefined>()
  const [previous, setPrevious] = useState<AuditRun | undefined>()
  const [filter, setFilter] = useState<CheckType | "all">("all")
  const [fileFilter, setFileFilter] = useState<string | undefined>()
  const [selectedId, setSelectedId] = useState<string | undefined>(run.findings[0]?.id)

  useEffect(() => {
    setFiles(undefined)
    setFilesError(undefined)
    setFileFilter(undefined)
    setFilter("all")
    setSelectedId(run.findings[0]?.id)
    api.files(run.id).then(setFiles, (e: Error) => setFilesError(e.message))
    const prev = runs.find((r) => r.id < run.id)
    setPrevious(undefined)
    if (prev) api.run(prev.id).then(setPrevious, () => setPrevious(undefined))
  }, [run.id, runs, run.findings])

  const selected = run.findings.find((f) => f.id === selectedId)
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <SummaryRow run={run} previous={previous} formula={formula} />
      <div className="grid min-h-0 flex-1 grid-cols-[240px_minmax(340px,400px)_1fr] gap-4">
        <div className="min-h-0 overflow-y-auto">
          {filesError ? <ErrorNote>{filesError}</ErrorNote> : files ? <ScopeTree files={files} findings={run.findings} selected={fileFilter} onSelect={setFileFilter} /> : <Loading />}
        </div>
        <FindingsList
          findings={run.findings}
          filter={filter}
          onFilter={setFilter}
          selectedId={selectedId}
          onSelect={setSelectedId}
          fileFilter={fileFilter}
          onClearFile={() => setFileFilter(undefined)}
        />
        <div className="min-h-0 overflow-y-auto pr-1 pb-32">
          <FindingDetail runId={run.id} finding={selected} />
        </div>
      </div>
    </div>
  )
}
