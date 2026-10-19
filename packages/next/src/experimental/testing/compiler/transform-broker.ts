import { createServer, createConnection, type Socket } from 'node:net'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import type {
  CompilerTransformInput,
  CompilerTransformResult,
} from './transform-hooks'

export interface CompilerTransformDescriptor {
  version: 1
  socket: string
  realm: string
  revision: string
  configFile?: string
  configDependencies?: string[]
}
const limit = 16 * 1024 * 1024
function frame(socket: Socket, value: unknown) {
  socket.end(JSON.stringify(value) + '\n')
}
function receive(
  socket: Socket,
  consume: (value: any) => void,
  fail: (error: Error) => void
) {
  let bytes = 0
  let content = ''
  let delivered = false
  socket.setEncoding('utf8')
  socket.on('data', (chunk: string) => {
    if (delivered) return fail(new Error('Duplicate compiler transform frame.'))
    bytes += Buffer.byteLength(chunk)
    if (bytes > limit)
      return fail(new Error('Compiler transform frame is too large.'))
    content += chunk
    const newline = content.indexOf('\n')
    if (newline < 0) return
    delivered = true
    if (newline !== content.length - 1)
      return fail(new Error('Invalid compiler transform framing.'))
    try {
      consume(JSON.parse(content.slice(0, newline)))
    } catch (error) {
      fail(error instanceof Error ? error : new Error(String(error)))
    }
  })
}

/** Parent-owned socket lifetime is independent of the configuration callback. */
export async function openCompilerTransformBroker(
  realm: string,
  call: (input: CompilerTransformInput) => Promise<CompilerTransformResult>,
  options: {
    signal?: AbortSignal
    configFile?: string
    configDependencies?: string[]
    onCancelled?: () => void
  } = {}
) {
  options.signal?.throwIfAborted()
  const directory = await mkdtemp(join(tmpdir(), 'nxt-transform-'))
  const descriptor: CompilerTransformDescriptor = {
    version: 1,
    socket: join(directory, 's'),
    realm,
    revision: randomUUID(),
    ...(options.configFile ? { configFile: options.configFile } : {}),
    ...(options.configDependencies
      ? { configDependencies: options.configDependencies }
      : {}),
  }
  const sockets = new Set<Socket>()
  let closing = false
  const server = createServer((socket) => {
    let processing = false
    sockets.add(socket)
    socket.on('close', () => {
      sockets.delete(socket)
      if (processing && !closing) options.onCancelled?.()
    })
    socket.on('error', () => {})
    const fail = (error: Error) => {
      if (!socket.destroyed) frame(socket, { error: error.message })
    }
    receive(
      socket,
      (request) => {
        if (
          closing ||
          request?.version !== 1 ||
          request.realm !== descriptor.realm ||
          request.revision !== descriptor.revision ||
          typeof request.requestId !== 'string' ||
          !request.input
        )
          return fail(new Error('Invalid or closed compiler transform lease.'))
        processing = true
        void call(request.input).then(
          (value) => {
            processing = false
            if (closing)
              return fail(
                new Error('Compiler transform lease closed during request.')
              )
            if (!socket.destroyed)
              frame(socket, { requestId: request.requestId, value })
          },
          (error) => {
            processing = false
            fail(error instanceof Error ? error : new Error(String(error)))
          }
        )
      },
      fail
    )
  })
  let disposal: Promise<void> | undefined
  const dispose = () =>
    (disposal ??= (async () => {
      closing = true
      options.signal?.removeEventListener('abort', cancel)
      for (const socket of sockets) socket.destroy()
      await new Promise<void>((resolve, reject) =>
        server.close((error) =>
          error &&
          (error as NodeJS.ErrnoException).code !== 'ERR_SERVER_NOT_RUNNING'
            ? reject(error)
            : resolve()
        )
      )
      await rm(directory, { recursive: true, force: true })
    })())
  const cancel = () => {
    void dispose().catch(() => {})
  }
  try {
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(descriptor.socket, () => {
        server.removeListener('error', reject)
        resolve()
      })
    })
    server.on('error', () => {
      options.onCancelled?.()
      cancel()
    })
    options.signal?.addEventListener('abort', cancel, { once: true })
    if (options.signal?.aborted) await dispose()
    options.signal?.throwIfAborted()
    return { descriptor, dispose }
  } catch (error) {
    for (const socket of sockets) socket.destroy()
    server.close()
    await rm(directory, { recursive: true, force: true })
    throw error
  }
}

export function requestCompilerTransform(
  descriptor: CompilerTransformDescriptor,
  input: CompilerTransformInput
): Promise<CompilerTransformResult> {
  return new Promise((resolve, reject) => {
    const socket = createConnection(descriptor.socket)
    const requestId = randomUUID()
    let settled = false
    const finish = (error?: Error, value?: CompilerTransformResult) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      socket.destroy()
      if (error) reject(error)
      else resolve(value!)
    }
    const timer = setTimeout(
      () => finish(new Error('Compiler transform request timed out.')),
      30000
    )
    socket.on('error', (error) => finish(error))
    socket.on('close', () => {
      if (!settled) finish(new Error('Compiler transform owner disconnected.'))
    })
    receive(
      socket,
      (response) => {
        if (response?.error) return finish(new Error(String(response.error)))
        if (
          response?.requestId !== requestId ||
          !response.value ||
          typeof response.value.code !== 'string' ||
          !Array.isArray(response.value.dependencies) ||
          response.value.dependencies.some(
            (file: unknown) => typeof file !== 'string'
          ) ||
          !Array.isArray(response.value.warnings) ||
          response.value.warnings.some(
            (warning: unknown) => typeof warning !== 'string'
          )
        )
          return finish(new Error('Invalid compiler transform response.'))
        finish(undefined, response.value)
      },
      (error) => finish(error)
    )
    socket.on('connect', () =>
      socket.write(
        JSON.stringify({
          version: 1,
          realm: descriptor.realm,
          revision: descriptor.revision,
          requestId,
          input,
        }) + '\n'
      )
    )
  })
}
