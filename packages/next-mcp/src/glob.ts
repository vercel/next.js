import type { AnyToolDefinition } from './vendor/eve/tool-definition'

/**
 * Turns the result of `import.meta.glob(pattern, { eager: true })` into a
 * `tools` record keyed by file basename:
 * `"./tools/get_weather.ts"` becomes `get_weather`.
 *
 * ```ts
 * tools: toolsFromGlob(import.meta.glob("./tools/*.ts", { eager: true }))
 * ```
 *
 * Each module's default export is the tool; `mcpRoute` validates it. Two
 * files with the same basename in different directories are an error.
 *
 * `import.meta.glob` is Turbopack-only. With webpack, import tools
 * explicitly.
 */
export function toolsFromGlob(
  modules: Readonly<Record<string, unknown>>
): Record<string, AnyToolDefinition> {
  if (typeof modules !== 'object' || modules === null) {
    throw new TypeError(
      '[@next/mcp] toolsFromGlob: expected the result of `import.meta.glob(pattern, { eager: true })`.'
    )
  }

  const tools: Record<string, AnyToolDefinition> = {}
  const sources = new Map<string, string>()
  for (const [path, mod] of Object.entries(modules)) {
    if (typeof mod === 'function') {
      throw new TypeError(
        `[@next/mcp] toolsFromGlob: "${path}" is a lazy import. Pass \`{ eager: true }\` to import.meta.glob.`
      )
    }
    const name = basename(path)
    const previous = sources.get(name)
    if (previous !== undefined) {
      throw new Error(
        `[@next/mcp] toolsFromGlob: "${previous}" and "${path}" both define a tool named "${name}". Tool file basenames must be unique.`
      )
    }
    if (
      typeof mod !== 'object' ||
      mod === null ||
      !('default' in mod) ||
      (mod as { default?: unknown }).default === undefined
    ) {
      throw new Error(
        `[@next/mcp] toolsFromGlob: "${path}" has no default export. Export the tool with \`export default defineTool({...})\`.`
      )
    }
    sources.set(name, path)
    tools[name] = (mod as { default: AnyToolDefinition }).default
  }
  return tools
}

function basename(path: string): string {
  const file = path.slice(path.lastIndexOf('/') + 1)
  const dot = file.lastIndexOf('.')
  return dot === -1 ? file : file.slice(0, dot)
}
