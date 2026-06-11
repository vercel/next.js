import path from 'path'
import fs from 'node:fs'
import { getCacheDirectory } from './get-cache-directory'

/**
 * Registry of running `next dev` servers, shared across all projects on this
 * machine. External tooling (e.g. MCP clients) reads this file to discover
 * running dev servers without scanning ports.
 *
 * Entries are keyed by the dev server's process id. Entries from processes
 * that died without cleaning up (e.g. SIGKILL) are dropped whenever the
 * registry is rewritten. Process ids can be recycled by the OS, so readers
 * must verify an entry by connecting to its `url` before relying on it.
 */
export type DevServerRegistryEntry = {
  projectDir: string
  url: string
  port: number
  startedAt: number
}

export type DevServerRegistry = Record<string, DevServerRegistryEntry>

// Single shared file for all projects, next to dev-state.json.
export const DEV_SERVER_REGISTRY_FILE = path.join(
  getCacheDirectory('nextjs-nodejs'),
  'dev-servers.json'
)

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

function readRegistry(file: string): DevServerRegistry {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'))
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed
    }
  } catch {
    // Missing or corrupt file — treat as empty
  }
  return {}
}

function writeRegistry(file: string, registry: DevServerRegistry): void {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const { sync: writeFileAtomicSync } =
    require('next/dist/compiled/write-file-atomic') as typeof import('next/dist/compiled/write-file-atomic')
  writeFileAtomicSync(file, JSON.stringify(registry))
}

function withoutDeadEntries(registry: DevServerRegistry): DevServerRegistry {
  const alive: DevServerRegistry = {}
  for (const [pid, entry] of Object.entries(registry)) {
    if (isProcessAlive(Number(pid))) {
      alive[pid] = entry
    }
  }
  return alive
}

export function registerDevServer(
  pid: number,
  entry: DevServerRegistryEntry,
  file: string = DEV_SERVER_REGISTRY_FILE
): void {
  if (process.env.NEXT_DISABLE_DEV_SERVER_REGISTRY) return
  try {
    const registry = withoutDeadEntries(readRegistry(file))
    registry[String(pid)] = entry
    writeRegistry(file, registry)
  } catch {
    // Best effort — discovery must never interfere with the dev server
  }
}

export function unregisterDevServer(
  pid: number | undefined,
  file: string = DEV_SERVER_REGISTRY_FILE
): void {
  if (process.env.NEXT_DISABLE_DEV_SERVER_REGISTRY) return
  if (pid == null) return
  try {
    if (!fs.existsSync(file)) return
    const registry = withoutDeadEntries(readRegistry(file))
    delete registry[String(pid)]
    writeRegistry(file, registry)
  } catch {
    // Best effort — must be safe to call from an exit handler
  }
}
