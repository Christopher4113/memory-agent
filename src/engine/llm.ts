import Anthropic from "@anthropic-ai/sdk"
import { Context, Effect, Layer, Option, Schema } from "effect"
import { LlmError, ParseError } from "./schema.js"
import { sha } from "./util.js"

export class LlmCache extends Context.Tag("LlmCache")<
  LlmCache,
  { get: (key: string) => Effect.Effect<Option.Option<string>>; set: (key: string, value: string) => Effect.Effect<void> }
>() {}

export const MemoryCacheLive = Layer.sync(LlmCache, () => {
  const m = new Map<string, string>()
  return {
    get: (k) => Effect.sync(() => Option.fromNullable(m.get(k))),
    set: (k, v) => Effect.sync(() => void m.set(k, v)),
  }
})

export class Llm extends Context.Tag("Llm")<
  Llm,
  { enabled: boolean; model: string; complete: (prompt: string) => Effect.Effect<string, LlmError> }
>() {}

export const LlmLive = Layer.effect(
  Llm,
  Effect.gen(function* () {
    const cache = yield* LlmCache
    const model = process.env.LLM_MODEL || "claude-haiku-5-5"
    const enabled = Boolean(process.env.ANTHROPIC_API_KEY)
    const client = enabled ? new Anthropic() : undefined
    const complete = (prompt: string) =>
      Effect.gen(function* () {
        if (!client) return yield* new LlmError({ message: "LLM checks skipped: add ANTHROPIC_API_KEY." })
        const key = sha(`${model}\n${prompt}`)
        const hit = yield* cache.get(key)
        if (Option.isSome(hit)) return hit.value
        const res = yield* Effect.tryPromise({
          try: () =>
            client.messages.create({
              model,
              max_tokens: 8000,
              output_config: { effort: "low" },
              messages: [{ role: "user", content: prompt }],
            }),
          catch: (e) => new LlmError({ message: e instanceof Error ? e.message : String(e) }),
        })
        if (res.stop_reason === "refusal") return yield* new LlmError({ message: "Model declined the request" })
        const text = res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("")
        yield* cache.set(key, text)
        return text
      })
    return { enabled, model, complete }
  }),
)

// Pull the first JSON value out of a reply (tolerates ```json fences) and validate it.
export const parseJson = <A, I>(schema: Schema.Schema<A, I>, text: string) => {
  const start = text.search(/[[{]/)
  const end = Math.max(text.lastIndexOf("}"), text.lastIndexOf("]"))
  const raw = start >= 0 && end > start ? text.slice(start, end + 1) : text
  return Schema.decodeUnknown(Schema.parseJson(schema))(raw).pipe(
    Effect.mapError((e) => new ParseError({ message: `Bad JSON from model: ${e.message.slice(0, 200)}` })),
  )
}

// Ask, validate, retry once on bad JSON.
export const askJson = <A, I>(schema: Schema.Schema<A, I>, prompt: string) =>
  Effect.gen(function* () {
    const llm = yield* Llm
    const first = yield* llm.complete(prompt)
    return yield* parseJson(schema, first).pipe(
      Effect.catchTag("ParseError", () =>
        llm.complete(`${prompt}\n\nReply with valid JSON only. No prose, no code fences.`).pipe(Effect.flatMap((t) => parseJson(schema, t))),
      ),
    )
  })
