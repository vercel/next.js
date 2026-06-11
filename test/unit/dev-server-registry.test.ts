import os from 'os'
import fs from 'fs'
import { join } from 'path'
import { spawnSync } from 'child_process'
import {
  registerDevServer,
  unregisterDevServer,
  type DevServerRegistryEntry,
} from 'next/dist/lib/helpers/dev-server-registry'

function tmpRegistryFile(): string {
  const dir = fs.mkdtempSync(join(os.tmpdir(), 'dev-server-registry-'))
  return join(dir, 'dev-servers.json')
}

function makeEntry(
  overrides: Partial<DevServerRegistryEntry> = {}
): DevServerRegistryEntry {
  return {
    projectDir: '/tmp/my-app',
    url: 'http://localhost:3000',
    port: 3000,
    startedAt: Date.now(),
    ...overrides,
  }
}

// Spawn a short-lived process and wait for it to exit, so its pid is
// guaranteed to be dead (spawnSync reaps the child before returning).
function getDeadPid(): number {
  const result = spawnSync(process.execPath, ['-e', ''])
  return result.pid
}

describe('dev-server-registry', () => {
  it('registers an entry keyed by pid', () => {
    const file = tmpRegistryFile()
    const entry = makeEntry()

    registerDevServer(process.pid, entry, file)

    const registry = JSON.parse(fs.readFileSync(file, 'utf8'))
    expect(registry).toEqual({ [String(process.pid)]: entry })
  })

  it('drops entries whose process is no longer alive', () => {
    const file = tmpRegistryFile()
    const deadPid = getDeadPid()
    fs.writeFileSync(
      file,
      JSON.stringify({
        [String(deadPid)]: makeEntry({ port: 3001 }),
      })
    )

    const entry = makeEntry()
    registerDevServer(process.pid, entry, file)

    const registry = JSON.parse(fs.readFileSync(file, 'utf8'))
    expect(registry[String(deadPid)]).toBeUndefined()
    expect(registry[String(process.pid)]).toEqual(entry)
  })

  it('unregisters an entry', () => {
    const file = tmpRegistryFile()
    registerDevServer(process.pid, makeEntry(), file)

    unregisterDevServer(process.pid, file)

    const registry = JSON.parse(fs.readFileSync(file, 'utf8'))
    expect(registry).toEqual({})
  })

  it('recovers from a corrupt registry file', () => {
    const file = tmpRegistryFile()
    fs.writeFileSync(file, 'not json{')

    const entry = makeEntry()
    expect(() => registerDevServer(process.pid, entry, file)).not.toThrow()

    const registry = JSON.parse(fs.readFileSync(file, 'utf8'))
    expect(registry).toEqual({ [String(process.pid)]: entry })
  })

  it('unregister is a no-op when the file does not exist', () => {
    const file = tmpRegistryFile()

    expect(() => unregisterDevServer(process.pid, file)).not.toThrow()
    expect(fs.existsSync(file)).toBe(false)
  })

  it('does nothing when NEXT_DISABLE_DEV_SERVER_REGISTRY is set', () => {
    const file = tmpRegistryFile()
    process.env.NEXT_DISABLE_DEV_SERVER_REGISTRY = '1'
    try {
      registerDevServer(process.pid, makeEntry(), file)
      expect(fs.existsSync(file)).toBe(false)
    } finally {
      delete process.env.NEXT_DISABLE_DEV_SERVER_REGISTRY
    }
  })
})
