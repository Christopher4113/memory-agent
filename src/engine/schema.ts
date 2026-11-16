import { Data, Schema } from "effect"

export const Scope = Schema.Literal("company", "project", "agent", "personal", "unknown")
export type Scope = typeof Scope.Type

export const CheckType = Schema.Literal("contradiction", "stale", "duplicate", "scope_leak", "secret")
export type CheckType = typeof CheckType.Type
export const CHECKS: readonly CheckType[] = ["contradiction", "stale", "duplicate", "scope_leak", "secret"]

export const Severity = Schema.Literal("high", "medium", "low")
export type Severity = typeof Severity.Type

export const MemoryFile = Schema.Struct({
  path: Schema.String,
  scope: Scope,
  scopeOwner: Schema.optional(Schema.String),
  content: Schema.String,
  lines: Schema.Array(Schema.String),
  modifiedAt: Schema.optional(Schema.String),
})
export type MemoryFile = typeof MemoryFile.Type

export const Fact = Schema.Struct({
  id: Schema.String,
  file: Schema.String,
  lineStart: Schema.Number,
  lineEnd: Schema.Number,
  subject: Schema.String,
  attribute: Schema.String,
  value: Schema.String,
  asOf: Schema.optional(Schema.String),
  text: Schema.String,
})
export type Fact = typeof Fact.Type

export const Evidence = Schema.Struct({
  file: Schema.String,
  scope: Scope,
  lineStart: Schema.Number,
  lineEnd: Schema.Number,
  snippet: Schema.String,
})
export type Evidence = typeof Evidence.Type

export const FixEdit = Schema.Struct({ file: Schema.String, before: Schema.String, after: Schema.String })
export type FixEdit = typeof FixEdit.Type

export const Finding = Schema.Struct({
  id: Schema.String,
  check: CheckType,
  severity: Severity,
  title: Schema.String,
  explanation: Schema.String,
  evidence: Schema.Array(Evidence),
  suggestedFix: Schema.Array(FixEdit),
})
export type Finding = typeof Finding.Type

export const AuditRun = Schema.Struct({
  id: Schema.Number,
  label: Schema.String,
  createdAt: Schema.String,
  source: Schema.String,
  fileCount: Schema.Number,
  factCount: Schema.Number,
  healthScore: Schema.Number,
  counts: Schema.Record({ key: CheckType, value: Schema.Number }),
  findings: Schema.Array(Finding),
  warnings: Schema.Array(Schema.String),
  llmEnabled: Schema.Boolean,
})
export type AuditRun = typeof AuditRun.Type

// Typed errors. The server maps these to friendly messages.
export class LoadError extends Data.TaggedError("LoadError")<{ message: string }> {}
export class ParseError extends Data.TaggedError("ParseError")<{ message: string }> {}
export class LlmError extends Data.TaggedError("LlmError")<{ message: string }> {}
export class DbError extends Data.TaggedError("DbError")<{ message: string }> {}
export type AuditError = LoadError | ParseError | LlmError | DbError

export type Progress = (step: string, pct: number) => void
