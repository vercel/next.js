import { createServer } from 'node:http'
import type { Socket } from 'node:net'
import { isAbsolute, relative } from 'node:path'
import type { TestEntry } from './contracts'
import type { ResultEvent, ResultStatus } from './reporting/events'

export function parseEditorApiPort(value: true | string): number {
  if (value === true) return 51204
  if (!/^(?:0|[1-9][0-9]*)$/.test(value))
    throw new Error('--api expects a decimal port from 0 to 65535.')
  const port = Number(value)
  if (!Number.isSafeInteger(port) || port > 65535)
    throw new Error('--api expects a decimal port from 0 to 65535.')
  return port
}

interface ObservedCase {
  entryId: string
  caseId: string
  name: string
  testName?: string
  ancestors: string[]
  status: 'running' | ResultStatus
  attempt: { id: string; retry: number; repeat: number }
}

/** Read-only Next discovery, distinct from a test execution/control protocol. */
export async function openTestDiscoveryApi(
  projectDir: string,
  entries: readonly TestEntry[],
  port: number
) {
  if (!Number.isInteger(port) || port < 0 || port > 65535)
    throw new Error('Invalid discovery API port.')
  const expected = new Map(entries.map((entry) => [entry.id, entry]))
  if (expected.size !== entries.length)
    throw new Error('Discovery API requires unique selected files.')
  const files = entries.map((entry) => {
    const file = relative(projectDir, entry.file).replaceAll('\\', '/')
    if (!file || file === '..' || file.startsWith('../') || isAbsolute(file))
      throw new Error('Discovery API file is outside the selected project.')
    return {
      id: entry.id,
      file,
      project: entry.profile.id,
      environment: entry.profile.environment,
      mode: entry.profile.mode,
    }
  })
  const cases = new Map<string, ObservedCase>()
  let run:
    | { id: string; status: 'running' | Exclude<ResultStatus, 'skipped'> }
    | undefined
  let closed = false
  let fault: Error | undefined
  let host = ''
  const sockets = new Set<Socket>()
  const server = createServer((request, response) => {
    response.setHeader('cache-control', 'no-store')
    response.setHeader('content-type', 'application/json; charset=utf-8')
    response.setHeader('x-content-type-options', 'nosniff')
    function send(status: number, value: unknown) {
      const bytes = JSON.stringify(value)
      response.statusCode = status
      response.setHeader('content-length', Buffer.byteLength(bytes))
      response.end(request.method === 'HEAD' ? undefined : bytes)
    }
    if (
      request.headers.host !== host ||
      (request.headers.origin !== undefined &&
        request.headers.origin !== 'http://' + host)
    ) {
      response.setHeader('connection', 'close')
      request.resume()
      send(403, { error: 'Discovery API requires its loopback origin.' })
      return
    }
    if (closed || fault) {
      send(503, { error: 'Discovery API is closing.' })
      return
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.setHeader('allow', 'GET, HEAD')
      response.setHeader('connection', 'close')
      request.resume()
      send(405, { error: 'Discovery API is read-only.' })
      return
    }
    if (request.url !== '/v1/discovery') {
      send(404, { error: 'Unknown discovery API path.' })
      return
    }
    send(200, {
      version: 1,
      protocol: 'next-test-discovery',
      observedCasesOnly: true,
      files,
      run: run ?? null,
      cases: [...cases.values()],
    })
  })
  server.on('connection', (socket) => {
    sockets.add(socket)
    socket.once('close', () => sockets.delete(socket))
    if (closed) socket.destroy()
  })
  server.on('error', (error) => {
    fault ??= error
  })
  let disposal: Promise<void> | undefined
  function dispose() {
    return (disposal ??= (async () => {
      closed = true
      const socketClosures = [...sockets].map(
        (socket) =>
          new Promise<void>((resolve) => socket.once('close', () => resolve()))
      )
      const serverClosure = new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (
            error &&
            (error as NodeJS.ErrnoException).code !== 'ERR_SERVER_NOT_RUNNING'
          )
            reject(error)
          else resolve()
        })
      })
      for (const socket of sockets) socket.destroy()
      await Promise.all([serverClosure, ...socketClosures])
      if (sockets.size) throw new Error('Discovery API sockets did not close.')
      if (fault) throw fault
    })())
  }
  try {
    await new Promise<void>((resolve, reject) => {
      const rejectListen = (error: Error) => reject(error)
      server.once('error', rejectListen)
      server.listen({ host: '127.0.0.1', port }, () => {
        server.removeListener('error', rejectListen)
        resolve()
      })
    })
    const address = server.address()
    if (!address || typeof address === 'string')
      throw new Error('Discovery API did not acquire a loopback port.')
    host = '127.0.0.1:' + address.port
  } catch (error) {
    await dispose().catch(() => {})
    throw error
  }
  return {
    url: 'http://' + host + '/v1/discovery',
    onEvent(event: ResultEvent) {
      if (closed) throw new Error('Discovery API owner is closed.')
      if (event.type === 'run-start') {
        if (run) throw new Error('Discovery API already owns a run.')
        run = { id: event.runId, status: 'running' }
        return
      }
      if (!run || event.runId !== run.id)
        throw new Error('Discovery API received a foreign run.')
      if (event.type === 'case-start' || event.type === 'case-end') {
        if (!expected.has(event.entryId))
          throw new Error('Discovery API received an unselected file.')
        cases.set(event.entryId + '\0' + event.caseId, {
          entryId: event.entryId,
          caseId: event.caseId,
          name: event.name,
          ...(event.testName === undefined ? {} : { testName: event.testName }),
          ancestors: event.ancestors?.map((ancestor) => ancestor.name) ?? [],
          status: event.type === 'case-start' ? 'running' : event.status,
          attempt: { ...event.attempt },
        })
      } else if (event.type === 'run-end') run.status = event.status
    },
    dispose,
  }
}
