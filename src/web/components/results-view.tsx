import { useEffect, useState } from "react"
import { Check, X } from "lucide-react"
import { api, type AuditRun, type Results } from "@/api"
import { Card } from "@/components/ui/card"
import { CHECK_LABEL, Empty, ErrorNote, Loading, SectionTitle } from "./shared"

export const ResultsView = ({ run }: { run: AuditRun }) => {
  const [res, setRes] = useState<Results | undefined>()
  const [error, setError] = useState<string | undefined>()
  useEffect(() => {
    setRes(undefined)
    setError(undefined)
    api.results(run.id).then(setRes, (e: Error) => setError(e.message))
  }, [run.id])

  if (error) return <ErrorNote>{error}</ErrorNote>
  if (!res) return <Loading />
  if (!res.applicable)
    return <Empty title="Results need the Northwind fixture">Ground truth exists only for the current Northwind demo (week 2). Load it and run an audit.</Empty>

  const total = res.rows.find((r) => r.check === "total")!
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="grid grid-cols-[1fr_1fr] gap-6">
        <div>
          <SectionTitle className="mb-1">Against expected.json</SectionTitle>
          <p className="mb-3 text-sm text-muted">
            Run #{run.id}: caught <b className="tabular-nums">{total.caught}</b> of {total.expected} planted issues with{" "}
            <b className="tabular-nums">{total.falsePositives}</b> false positive{total.falsePositives === 1 ? "" : "s"}.
            {!run.llmEnabled && " LLM checks were skipped, so contradictions can't be caught on this run."}
          </p>
          <Card>
            <table className="w-full text-sm tabular-nums">
              <thead>
                <tr className="border-b border-hairline text-left text-xs text-subtle">
                  <th className="px-3 py-2 font-medium">Check</th>
                  <th className="px-3 py-2 text-right font-medium">Planted</th>
                  <th className="px-3 py-2 text-right font-medium">Caught</th>
                  <th className="px-3 py-2 text-right font-medium">Missed</th>
                  <th className="px-3 py-2 text-right font-medium">False positives</th>
                </tr>
              </thead>
              <tbody>
                {res.rows.map((r) => (
                  <tr key={r.check} className={r.check === "total" ? "font-medium" : "border-b border-hairline"}>
                    <td className="px-3 py-2">{r.check === "total" ? "Total" : CHECK_LABEL[r.check]}</td>
                    <td className="px-3 py-2 text-right">{r.expected}</td>
                    <td className="px-3 py-2 text-right text-primary">{r.caught}</td>
                    <td className={`px-3 py-2 text-right ${r.missed ? "text-danger" : ""}`}>{r.missed}</td>
                    <td className={`px-3 py-2 text-right ${r.falsePositives ? "text-warning" : ""}`}>{r.falsePositives}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
          {res.falsePositives.length > 0 && (
            <>
              <h3 className="mt-6 mb-2 text-sm font-medium">False positives</h3>
              <Card>
                <ul>
                  {res.falsePositives.map((f) => (
                    <li key={f.id} className="border-b border-hairline px-3 py-2 text-sm last:border-b-0">
                      <span className="text-xs text-subtle">{CHECK_LABEL[f.check]} · </span>
                      {f.title}
                    </li>
                  ))}
                </ul>
              </Card>
            </>
          )}
        </div>
        <div>
          <SectionTitle className="mb-3">Planted issues</SectionTitle>
          <Card>
            <ul>
              {res.matches.map((m) => (
                <li key={m.expected.id} className="flex items-start gap-2 border-b border-hairline px-3 py-2 text-sm last:border-b-0">
                  {m.findingId ? <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-label="caught" /> : <X className="mt-0.5 size-4 shrink-0 text-danger" aria-label="missed" />}
                  <span className="w-7 shrink-0 font-mono text-xs leading-5 text-subtle">{m.expected.id}</span>
                  <span className="flex-1">{m.expected.description}</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  )
}
