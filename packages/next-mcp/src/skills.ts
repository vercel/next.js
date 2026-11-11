import { createHash } from 'node:crypto'
import path from 'node:path'

import {
  DIRECTORY_MIME_TYPE,
  SKILL_LIMITS,
  SkillsExtension,
  type Skill,
  type SkillReadResult,
  type SkillResourceEntry,
  type SkillSource,
} from '@modelcontextprotocol/server/ext/skills'
import {
  loadSkills,
  nodeSkillFiles,
} from '@modelcontextprotocol/server/ext/skills/node'

import { isNextDevServer } from './vendor/eve/auth'

/** Clients may cache listings and reads for this long (SEP-2549 hint). */
const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000

const SKILL_SCHEME = 'skill://'

export interface SkillsFromDirectoryOptions {
  /**
   * Skills with a file larger than this many bytes are not served. Unset by
   * default: only the spec's per-skill limits (512 files, 16 MiB) apply. Set
   * it when the host caps response sizes. A `resources/read` response carries
   * the whole file, base64-encoded for binary content (+33%).
   */
  readonly maxFileSize?: number
  /** Serves skills as `skill://<prefix>/<skill>/...`. */
  readonly prefix?: string
}

/** What `mcpRoute`'s `skills` option accepts. */
export interface McpSkills {
  /** @internal */
  readonly extension: SkillsExtension
}

interface ServedFile {
  readonly entry: SkillResourceEntry
  /** Path relative to the skills root, `/`-separated. */
  readonly path: string
}

interface Catalog {
  readonly skills: readonly Skill[]
  readonly files: ReadonlyMap<string, ServedFile>
  /** Every directory URI below a served skill, the skill roots included. */
  readonly directories: ReadonlySet<string>
}

/**
 * Serves a folder of [Agent Skills](https://agentskills.io) over MCP
 * (the `io.modelcontextprotocol/skills` extension, SEP-2640):
 *
 * ```ts
 * // app/mcp/route.ts
 * import path from "node:path"
 * import { mcpRoute } from "@next/mcp"
 * import { skillsFromDirectory } from "@next/mcp/skills"
 *
 * export const { GET, POST, DELETE } = mcpRoute({
 *   // ...
 *   skills: skillsFromDirectory(path.join(process.cwd(), "skills")),
 * })
 * ```
 *
 * Each subfolder with a `SKILL.md` is one skill; its frontmatter `name` must
 * match the folder name. Every file in it, including binary assets, is
 * served as a resource under `skill://<skill>/<file>`.
 *
 * Write the path as `path.join(process.cwd(), "<dir>")` in the route itself.
 * That expression is what lets `next build` include exactly that folder in
 * the deployment; a relative path is rejected because it would work locally
 * and be missing once deployed.
 *
 * Nothing is read until a client asks for skills, so cold starts that only
 * serve tools pay nothing. In production the catalog is then kept for the
 * life of the process; under `next dev` it is rebuilt on every skills
 * request, so edits show up immediately.
 */
export function skillsFromDirectory(
  root: string,
  options: SkillsFromDirectoryOptions = {}
): McpSkills {
  if (typeof root !== 'string' || !path.isAbsolute(root)) {
    throw new Error(
      `[@next/mcp] skillsFromDirectory: pass an absolute path, such as path.join(process.cwd(), ${JSON.stringify(
        typeof root === 'string' ? root : 'skills'
      )}), so that next build includes the skill files in the deployment.`
    )
  }
  const maxFileSize = options.maxFileSize ?? Infinity
  if (
    options.maxFileSize !== undefined &&
    (!Number.isFinite(maxFileSize) || maxFileSize <= 0)
  ) {
    throw new Error(
      '[@next/mcp] skillsFromDirectory: `maxFileSize` must be a positive number of bytes.'
    )
  }

  const files = nodeSkillFiles(root)
  const dev = isNextDevServer()
  let cached: Promise<Catalog> | undefined

  const catalog = (): Promise<Catalog> => {
    if (dev) return buildCatalog(root, options.prefix, maxFileSize)
    cached ??= buildCatalog(root, options.prefix, maxFileSize).catch(
      (error) => {
        cached = undefined // retry on the next request
        throw error
      }
    )
    return cached
  }

  const source: SkillSource = {
    async list() {
      return { skills: [...(await catalog()).skills] }
    },
    async get(uri) {
      return (await catalog()).skills.find((skill) => skill.uri === uri)
    },
    async read(uri): Promise<SkillReadResult | undefined> {
      // Only files that a served skill's manifest lists are readable.
      const file = (await catalog()).files.get(uri)
      if (file === undefined) return undefined
      const bytes = await files.read(file.path)
      // The listing promised these bytes. A file that changed since then
      // (only possible while developing) must not be served under the old
      // digest.
      if (sha256(bytes) !== file.entry.digest) {
        throw new Error(
          `Skill file changed after it was listed: ${uri}. Call skills/get to refresh.`
        )
      }
      const mimeType = mimeTypeOf(file.path)
      const text = isTextMimeType(mimeType) ? decodeUtf8(bytes) : undefined
      // Text that is not valid UTF-8 goes out as bytes, so a host that
      // re-encodes it still gets the digest the listing published.
      return text === undefined ? { bytes, mimeType } : { text, mimeType }
    },
    async readDirectory(uri) {
      const { files: served, directories } = await catalog()
      if (!directories.has(uri)) return undefined
      const prefix = `${uri}/`
      const children = new Map<
        string,
        { uri: string; name: string; mimeType: string; size?: number }
      >()
      for (const [fileUri, file] of served) {
        if (!fileUri.startsWith(prefix)) continue
        const rest = fileUri.slice(prefix.length)
        const slash = rest.indexOf('/')
        if (slash === -1) {
          children.set(fileUri, {
            uri: fileUri,
            name: decodeURIComponent(rest),
            mimeType: mimeTypeOf(file.path),
            size: file.entry.size,
          })
        } else {
          const dirUri = prefix + rest.slice(0, slash)
          children.set(dirUri, {
            uri: dirUri,
            name: decodeURIComponent(rest.slice(0, slash)),
            mimeType: DIRECTORY_MIME_TYPE,
          })
        }
      }
      return {
        resources: [...children.values()].sort((a, b) =>
          a.name < b.name ? -1 : a.name > b.name ? 1 : 0
        ),
      }
    },
    async listResources() {
      return (await catalog()).skills.map((skill) => ({
        uri: skill.uri,
        name: String(skill.frontmatter.name),
        description: String(skill.frontmatter.description),
        mimeType: 'text/markdown',
      }))
    },
  }

  return Object.freeze({
    extension: new SkillsExtension({
      source,
      cacheHint: {
        ttlMs: dev ? 0 : DEFAULT_CACHE_TTL_MS,
        cacheScope: 'private',
      },
    }),
  })
}

async function buildCatalog(
  root: string,
  prefix: string | undefined,
  maxFileSize: number
): Promise<Catalog> {
  const loaded = await loadSkills(root, {
    ...(prefix === undefined ? {} : { prefix }),
    onWarning: (warning) =>
      warnOnce(`[@next/mcp] skills: ${warning.path}: ${warning.message}`),
  })

  const skills: Skill[] = []
  const files = new Map<string, ServedFile>()
  const directories = new Set<string>()
  const base = prefix === undefined ? SKILL_SCHEME : `${SKILL_SCHEME}${prefix}/`

  for (const skill of loaded.entries) {
    if (!Array.isArray(skill.resources)) continue
    const resources = skill.resources
    const oversized = resources.find((r) => r.size > maxFileSize)
    const total = resources.reduce((sum, r) => sum + r.size, 0)
    const reason =
      oversized !== undefined
        ? `${oversized.uri} is ${oversized.size} bytes, over maxFileSize (${maxFileSize})`
        : resources.length > SKILL_LIMITS.files
          ? `it has ${resources.length} files, over the ${SKILL_LIMITS.files}-file limit`
          : total > SKILL_LIMITS.bytes
            ? `it is ${total} bytes, over the ${SKILL_LIMITS.bytes}-byte limit`
            : undefined
    if (reason !== undefined) {
      warnOnce(`[@next/mcp] skills: not serving ${skill.uri}: ${reason}.`)
      continue
    }

    skills.push(skill)
    const skillRoot = skill.uri.slice(0, -'/SKILL.md'.length)
    for (const entry of resources) {
      if (!entry.uri.startsWith(base)) continue
      // `prefix` only appears in URIs; files live at <root>/<skill>/...
      const relative = entry.uri
        .slice(base.length)
        .split('/')
        .map(decodeURIComponent)
        .join('/')
      files.set(entry.uri, { entry, path: relative })
      // Every directory between the skill root and the file.
      let dir = entry.uri.slice(0, entry.uri.lastIndexOf('/'))
      while (dir.length >= skillRoot.length) {
        directories.add(dir)
        dir = dir.slice(0, dir.lastIndexOf('/'))
      }
    }
  }

  return { skills, files, directories }
}

// Under `next dev` the catalog is rebuilt on every skills request; say each
// problem once per process instead of on every request.
const warned = new Set<string>()
function warnOnce(message: string): void {
  if (warned.has(message)) return
  warned.add(message)
  console.warn(message)
}

function decodeUtf8(bytes: Uint8Array): string | undefined {
  try {
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(
      bytes
    )
  } catch {
    return undefined
  }
}

function sha256(bytes: Uint8Array): string {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`
}

const MIME_TYPES: Readonly<Record<string, string>> = {
  css: 'text/css',
  csv: 'text/csv',
  gif: 'image/gif',
  htm: 'text/html',
  html: 'text/html',
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  js: 'text/javascript',
  json: 'application/json',
  md: 'text/markdown',
  mjs: 'text/javascript',
  pdf: 'application/pdf',
  png: 'image/png',
  py: 'text/x-python',
  sh: 'text/x-shellscript',
  svg: 'image/svg+xml',
  toml: 'application/toml',
  ts: 'text/typescript',
  tsx: 'text/typescript',
  txt: 'text/plain',
  webp: 'image/webp',
  xml: 'application/xml',
  yaml: 'application/yaml',
  yml: 'application/yaml',
  zip: 'application/zip',
}

function mimeTypeOf(file: string): string {
  const dot = file.lastIndexOf('.')
  const ext = dot === -1 ? '' : file.slice(dot + 1).toLowerCase()
  return MIME_TYPES[ext] ?? 'application/octet-stream'
}

function isTextMimeType(mimeType: string): boolean {
  return (
    mimeType.startsWith('text/') ||
    mimeType === 'application/json' ||
    mimeType === 'application/xml' ||
    mimeType === 'application/yaml' ||
    mimeType === 'application/toml' ||
    mimeType === 'image/svg+xml'
  )
}
