import { Effect } from "effect"
import { readdir, readFile, stat } from "node:fs/promises"
import path from "node:path"
import { unzipSync, strFromU8 } from "fflate"
import { LoadError, type MemoryFile } from "./schema.js"
import { scopeFor, SCOPE_RULES } from "./scopes.js"

const isMarkdown = (p: string) => /\.(md|markdown|mdx)$/i.test(p) && !p.split("/").some((s) => s.startsWith(".") || s === "__MACOSX")

export const FIXTURE_DIR = path.resolve(import.meta.dirname, "../../fixtures/northwind")

const toFile = (relPath: string, content: string, modifiedAt?: string): MemoryFile => {
  const normalized = content.replace(/\r\n/g, "\n")
  return {
    path: relPath,
    ...scopeFor(relPath),
    content: normalized,
    lines: normalized.split("\n"),
    ...(modifiedAt ? { modifiedAt } : {}),
  }
}

// If every path sits under a wrapper folder (e.g. "export/memories/..."), strip it so scope rules match.
const stripWrapper = (paths: string[]): ((p: string) => string) => {
  const memIdx = paths.map((p) => p.split("/").indexOf("memories"))
  if (paths.length && memIdx.every((i) => i >= 0)) return (p) => p.split("/").slice(p.split("/").indexOf("memories") + 1).join("/")
  const firstSegs = new Set(paths.map((p) => p.split("/")[0]))
  const [only] = [...firstSegs]
  if (firstSegs.size === 1 && paths.every((p) => p.includes("/")) && !SCOPE_RULES.some((r) => r.prefix === `${only}/`))
    return (p) => p.split("/").slice(1).join("/")
  return (p) => p
}

const walk = async (dir: string): Promise<string[]> => {
  const out: string[] = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...(await walk(full)))
    else out.push(full)
  }
  return out
}

export const loadFolder = (dir: string) =>
  Effect.tryPromise({
    try: async () => {
      const root = path.resolve(dir)
      const s = await stat(root)
      if (!s.isDirectory()) throw new Error(`${dir} is not a folder`)
      const rel = (await walk(root)).map((f) => path.relative(root, f).split(path.sep).join("/")).filter(isMarkdown)
      const strip = stripWrapper(rel)
      return Promise.all(
        rel.sort().map(async (r) => {
          const full = path.join(root, r)
          const [content, st] = await Promise.all([readFile(full, "utf8"), stat(full)])
          return toFile(strip(r), content, st.mtime.toISOString())
        }),
      )
    },
    catch: (e) => new LoadError({ message: `Could not read folder "${dir}": ${e instanceof Error ? e.message : String(e)}` }),
  })

export const loadZip = (bytes: Uint8Array) =>
  Effect.try({
    try: () => {
      const entries = unzipSync(bytes)
      const rel = Object.keys(entries).filter((p) => !p.endsWith("/") && isMarkdown(p)).sort()
      if (!rel.length) throw new Error("no Markdown files found in the archive")
      const strip = stripWrapper(rel)
      return rel.map((r) => toFile(strip(r), strFromU8(entries[r]!)))
    },
    catch: (e) => new LoadError({ message: `Could not read .zip: ${e instanceof Error ? e.message : String(e)}` }),
  })

// "earlier" overlays a few cleaner files on top of the main fixture, so two runs show drift.
export const loadFixture = (snapshot: "current" | "earlier" = "current") =>
  Effect.gen(function* () {
    const files = yield* loadFolder(path.join(FIXTURE_DIR, "memories"))
    if (snapshot === "current") return files
    const overlay = yield* loadFolder(path.join(FIXTURE_DIR, "earlier"))
    const byPath = new Map(overlay.map((f) => [f.path, f]))
    return files.map((f) => byPath.get(f.path) ?? f)
  })
