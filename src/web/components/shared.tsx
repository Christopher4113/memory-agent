import type { ReactNode } from "react"
import { AlertTriangle, Loader2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import type { CheckType, Finding, Scope, Severity } from "@/api"

export const CHECK_LABEL: Record<CheckType, string> = {
  contradiction: "Contradiction",
  stale: "Stale",
  duplicate: "Duplicate",
  scope_leak: "Scope leak",
  secret: "Secret",
}
export const CHECK_PLURAL: Record<CheckType, string> = {
  contradiction: "contradictions",
  stale: "stale facts",
  duplicate: "duplicates",
  scope_leak: "scope leaks",
  secret: "secrets",
}

export const SeverityDot = ({ severity, className }: { severity: Severity; className?: string }) => (
  <span
    aria-label={`${severity} severity`}
    className={cn(
      "inline-block size-2 shrink-0 rounded-full",
      severity === "high" ? "bg-danger" : severity === "medium" ? "bg-warning" : "bg-[#9b9b99]",
      className,
    )}
  />
)

export const ScopeTag = ({ scope }: { scope: Scope }) => <Badge variant={scope}>{scope}</Badge>

export const scopesOf = (f: Finding) => [...new Set(f.evidence.map((e) => e.scope))]

export const ErrorNote = ({ children }: { children: ReactNode }) => (
  <div role="alert" className="flex items-start gap-2 rounded-[var(--radius-base)] border border-danger/40 bg-[#fdf3f4] px-3 py-2 text-sm text-danger">
    <AlertTriangle className="mt-0.5 size-4 shrink-0" />
    <div>{children}</div>
  </div>
)

export const Loading = ({ label = "Loading" }: { label?: string }) => (
  <div className="flex items-center gap-2 p-4 text-sm text-subtle">
    <Loader2 className="size-4 animate-spin" /> {label}…
  </div>
)

export const Empty = ({ title, children }: { title: string; children?: ReactNode }) => (
  <div className="flex flex-col items-center justify-center gap-1 px-6 py-12 text-center">
    <p className="font-serif text-xl">{title}</p>
    {children && <p className="max-w-sm text-sm text-subtle">{children}</p>}
  </div>
)

export const SectionTitle = ({ children, className }: { children: ReactNode; className?: string }) => (
  <h2 className={cn("font-serif text-2xl leading-tight", className)}>{children}</h2>
)
