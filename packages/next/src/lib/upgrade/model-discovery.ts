import { randomUUID } from 'crypto'
import spawn from 'next/dist/compiled/cross-spawn'
import createDebug from 'next/dist/compiled/debug'

const debug = createDebug('next:upgrade')

export type UpgradeModel = {
  id: string
  label: string
  description: string
  efforts: string[]
  isDefault: boolean
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function string(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function efforts(value: unknown): string[] {
  return Array.isArray(value)
    ? [
        ...new Set(
          value.map(string).filter((level) => level && level !== 'default')
        ),
      ]
    : []
}

function parseModels(
  value: unknown,
  parse: (model: Record<string, unknown>) => UpgradeModel | null
): UpgradeModel[] {
  if (!Array.isArray(value)) {
    throw new Error('unexpected model catalog format')
  }
  return value
    .map((entry) => parse(record(entry)))
    .filter((model) => model !== null)
}

type DiscoveryProtocol = {
  initialize(): void
  receive(message: Record<string, unknown>): void
}

export function getCodexModels(
  path: string,
  cwd: string,
  signal?: AbortSignal,
  onFailure?: () => void,
  env?: NodeJS.ProcessEnv
) {
  return discoverModels(
    'codex',
    path,
    ['app-server'],
    cwd,
    signal,
    onFailure,
    (send, complete) => {
      const initializeId = randomUUID()
      let listId: string | undefined
      const models: UpgradeModel[] = []
      const cursors = new Set<string>()
      const list = (cursor?: string) => {
        listId = randomUUID()
        send({
          id: listId,
          method: 'model/list',
          params: { includeHidden: false, ...(cursor ? { cursor } : {}) },
        })
      }
      return {
        initialize() {
          send({
            id: initializeId,
            method: 'initialize',
            params: { clientInfo: { name: 'next_upgrade', version: '1' } },
          })
        },
        receive(message) {
          if (
            message.id !== initializeId &&
            (listId === undefined || message.id !== listId)
          )
            return
          if (message.error) throw new Error('CLI returned a protocol error')
          if (message.id === initializeId) {
            if (!message.result)
              throw new Error('missing initialization result')
            send({ method: 'initialized' })
            list()
            return
          }
          const response = record(message.result)
          models.push(
            ...parseModels(response.data, (model) => {
              const id = string(model.model)
              if (!id || model.hidden === true) return null
              return {
                id,
                label: string(model.displayName) || id,
                description: string(model.description),
                efforts: efforts(
                  Array.isArray(model.supportedReasoningEfforts)
                    ? model.supportedReasoningEfforts.map(
                        (level) => record(level).reasoningEffort
                      )
                    : undefined
                ),
                isDefault: model.isDefault === true,
              }
            })
          )
          const cursor = response.nextCursor
          if (cursor !== null && cursor !== undefined) {
            if (typeof cursor !== 'string' || !cursor || cursors.has(cursor)) {
              throw new Error('invalid pagination cursor')
            }
            cursors.add(cursor)
            list(cursor)
            return
          }
          complete(models)
        },
      }
    },
    env
  )
}

export function getClaudeModels(
  path: string,
  cwd: string,
  signal?: AbortSignal,
  onFailure?: () => void,
  env?: NodeJS.ProcessEnv
) {
  return discoverModels(
    'claude',
    path,
    [
      '-p',
      '--input-format',
      'stream-json',
      '--output-format',
      'stream-json',
      '--verbose',
      '--no-session-persistence',
    ],
    cwd,
    signal,
    onFailure,
    (send, complete) => {
      const initializeId = randomUUID()
      return {
        initialize() {
          send({
            type: 'control_request',
            request_id: initializeId,
            request: { subtype: 'initialize' },
          })
        },
        receive(message) {
          if (message.type !== 'control_response') return
          const response = record(message.response)
          if (response.request_id !== initializeId) return
          if (response.subtype !== 'success')
            throw new Error('CLI returned an initialization error')
          complete(
            parseModels(record(response.response).models, (model) => {
              const id = string(model.value)
              if (!id) return null
              return {
                id,
                label: string(model.displayName) || id,
                description: string(model.description),
                efforts:
                  model.supportsEffort === false
                    ? []
                    : efforts(model.supportedEffortLevels),
                isDefault: id === 'default',
              }
            })
          )
        },
      }
    },
    env
  )
}

// `env` replaces the CLI's environment, e.g. to read the models a fresh
// install offers instead of those from the user's own agent configuration.
export function getHarnessModels(
  name: 'codex' | 'claude',
  path: string,
  cwd: string,
  signal?: AbortSignal,
  env?: NodeJS.ProcessEnv
): Promise<UpgradeModel[] | null> {
  return name === 'codex'
    ? getCodexModels(path, cwd, signal, undefined, env)
    : getClaudeModels(path, cwd, signal, undefined, env)
}

// Scheduled upgrades pick the entry next upgrade --agent highlights by default.
// An empty catalog means no --model. A failed discovery throws instead.
export async function getDefaultHarnessModel(
  name: 'codex' | 'claude',
  path: string,
  cwd: string
): Promise<string | null> {
  let failed = false
  const onFailure = () => {
    failed = true
  }
  const models =
    name === 'codex'
      ? await getCodexModels(path, cwd, undefined, onFailure)
      : await getClaudeModels(path, cwd, undefined, onFailure)
  if (failed || models === null) {
    throw new Error(`${name} model discovery failed`)
  }
  return (models.find(({ isDefault }) => isDefault) ?? models[0])?.id ?? null
}

// null means discovery was cancelled, rather than an unavailable catalog.
async function discoverModels(
  name: string,
  path: string,
  args: string[],
  cwd: string,
  signal: AbortSignal | undefined,
  onFailure: (() => void) | undefined,
  createProtocol: (
    send: (message: unknown) => void,
    complete: (models: UpgradeModel[]) => void
  ) => DiscoveryProtocol,
  env?: NodeJS.ProcessEnv
): Promise<UpgradeModel[] | null> {
  if (signal?.aborted) return null
  let child: ReturnType<typeof spawn>
  try {
    child = spawn(path, args, {
      cwd,
      env: env ?? process.env,
      stdio: 'pipe',
      // Without its own session the CLI shares the controlling terminal and
      // can reset its mode while a menu is open, so Enter stops working.
      detached: process.platform !== 'win32',
    })
  } catch {
    debug('%s model discovery failed: could not start CLI', name)
    onFailure?.()
    return []
  }

  // The CLI runs in its own process group; signal the whole group so no
  // helper process it started outlives discovery and touches the terminal.
  const killGroup = (killSignal: NodeJS.Signals) => {
    try {
      if (process.platform !== 'win32' && child.pid) {
        process.kill(-child.pid, killSignal)
      } else {
        child.kill(killSignal)
      }
    } catch {}
  }

  return new Promise((resolve) => {
    let buffer = ''
    let bytes = 0
    let stopping = false
    let result: UpgradeModel[] | null = []
    let killTimer: ReturnType<typeof setTimeout> | undefined

    const stop = (value: UpgradeModel[] | null, reason?: string) => {
      if (stopping) return
      stopping = true
      result = value
      clearTimeout(timeout)
      if (reason) {
        debug('%s model discovery failed: %s', name, reason)
        if (
          value !== null &&
          value.length === 0 &&
          reason !== 'no usable models'
        )
          onFailure?.()
      }
      child.stdin?.end()
      killGroup('SIGTERM')
      killTimer = setTimeout(() => killGroup('SIGKILL'), 250)
    }
    const timeout = setTimeout(() => stop([], 'timed out'), 5000)
    const interrupt = () => stop(null)
    process.on('SIGINT', interrupt)
    process.on('SIGTERM', interrupt)
    process.on('SIGHUP', interrupt)

    const send = (message: unknown) => {
      if (!stopping) child.stdin?.write(JSON.stringify(message) + '\n')
    }
    const protocol = createProtocol(send, (models) => {
      const unique = [
        ...new Map(models.map((model) => [model.id, model])).values(),
      ]
      stop(unique, unique.length ? undefined : 'no usable models')
    })
    signal?.addEventListener('abort', interrupt, { once: true })
    const countOutput = (chunk: Buffer | string) => {
      bytes += Buffer.byteLength(chunk)
      if (bytes > 20 * 1024 * 1024) stop([], 'output limit exceeded')
    }
    child.stdout?.setEncoding('utf8')
    child.stdout?.on('data', (chunk: string) => {
      countOutput(chunk)
      if (stopping) return
      buffer += chunk
      let newline: number
      while (!stopping && (newline = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, newline).trim()
        buffer = buffer.slice(newline + 1)
        if (!line) continue
        try {
          protocol.receive(record(JSON.parse(line)))
        } catch {
          stop([], 'invalid discovery response')
        }
      }
    })
    // Drain stderr, but never log raw CLI output (which may contain credentials).
    child.stderr?.on('data', countOutput)
    child.stdin?.on('error', () =>
      stop([], 'could not write discovery request')
    )
    child.on('error', () => stop([], 'could not start CLI'))
    child.once('close', () => {
      clearTimeout(timeout)
      clearTimeout(killTimer)
      killGroup('SIGKILL')
      process.removeListener('SIGINT', interrupt)
      process.removeListener('SIGTERM', interrupt)
      process.removeListener('SIGHUP', interrupt)
      signal?.removeEventListener('abort', interrupt)
      if (!stopping) {
        debug('%s model discovery failed: CLI exited early', name)
        onFailure?.()
      }
      resolve(result)
    })
    child.once('spawn', protocol.initialize)
  })
}
