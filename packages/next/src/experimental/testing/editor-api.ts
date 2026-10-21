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

/**
 * Next-owned discovery; callers opt in to execution controls explicitly.
 * GET /v1/discovery advertises controls.cancel and the actual current run ID.
 * POST /v1/runs/<encoded run ID>/cancel acknowledges before invoking its owner.
 * Optional fileControls list exact development or production Node entry IDs for
 * POST /v1/runs/<run ID>/files/<entry ID>/rerun. These controls are additive;
 * existing run-control discovery and read-only callers retain their shape.
 * This protocol does not imply compatibility with an existing editor extension.
 */
export async function openTestDiscoveryApi(
  projectDir: string,
  entries: readonly TestEntry[],
  port: number,
  controls?: {
    cancelRun(): void
    rerun?(): void
    rerunFile?(entryId: string): void
  }
) {
  if (!Number.isInteger(port) || port < 0 || port > 65535)
    throw new Error('Invalid discovery API port.')
  const expected = new Map<string, TestEntry>()
  function selectedFiles(selected: readonly TestEntry[]) {
    const next = new Map(selected.map((entry) => [entry.id, entry]))
    if (next.size !== selected.length)
      throw new Error('Discovery API requires unique selected files.')
    const result = selected.map((entry) => {
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
    expected.clear()
    for (const [id, entry] of next) expected.set(id, entry)
    return result
  }
  let files = selectedFiles(entries)
  const cases = new Map<string, ObservedCase>()
  let run:
    | { id: string; status: 'running' | Exclude<ResultStatus, 'skipped'> }
    | undefined
  let closed = false
  let cancellationRequested = false
  let cancellationStarted = false
  let rerunRequested = false
  let rerunStarted = false
  let rerunEntryId: string | undefined
  let fault: Error | undefined
  let host = ''
  function fileRerunEntries() {
    return [...expected.values()].filter(
      ({ profile }) =>
        profile.environment === 'node' &&
        (profile.mode === 'development' || profile.mode === 'production') &&
        profile.runtime === 'nodejs' &&
        profile.bundler === 'turbopack' &&
        profile.route === undefined
    )
  }
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
    const fileRerun = /^\/v1\/runs\/([^/]+)\/files\/([^/]+)\/rerun$/.exec(
      request.url ?? ''
    )
    if (controls?.rerunFile && fileRerun) {
      request.resume()
      if (request.method !== 'POST') {
        response.setHeader('allow', 'POST')
        send(405, { error: 'File reruns require POST.' })
        return
      }
      let runId: string
      let entryId: string
      try {
        runId = decodeURIComponent(fileRerun[1])
        entryId = decodeURIComponent(fileRerun[2])
      } catch {
        send(400, { error: 'Invalid file rerun identity.' })
        return
      }
      if (!run || run.id !== runId || run.status === 'running') {
        send(409, { error: 'Rerunning requires the current settled test run.' })
        return
      }
      if (!fileRerunEntries().some((entry) => entry.id === entryId)) {
        send(409, {
          error:
            'File reruns require a current development or production Node file.',
        })
        return
      }
      if (rerunRequested && rerunEntryId !== entryId) {
        send(409, { error: 'A different rerun is already requested.' })
        return
      }
      const repeated = rerunRequested
      rerunRequested = true
      rerunEntryId = entryId
      response.once('finish', () => {
        if (closed || rerunStarted) return
        rerunStarted = true
        try {
          controls.rerunFile!(entryId)
        } catch (error) {
          fault ??= error instanceof Error ? error : new Error(String(error))
        }
      })
      send(202, {
        version: 1,
        protocol: 'next-test-control',
        command: 'rerun-file',
        runId,
        entryId,
        status: repeated ? 'already-requested' : 'accepted',
      })
      return
    }
    const rerun = /^\/v1\/runs\/([^/]+)\/rerun$/.exec(request.url ?? '')
    if (controls?.rerun && rerun) {
      request.resume()
      if (request.method !== 'POST') {
        response.setHeader('allow', 'POST')
        send(405, { error: 'Run reruns require POST.' })
        return
      }
      let runId: string
      try {
        runId = decodeURIComponent(rerun[1])
      } catch {
        send(400, { error: 'Invalid rerun run ID.' })
        return
      }
      if (!run || run.id !== runId || run.status === 'running') {
        send(409, { error: 'Rerunning requires the current settled test run.' })
        return
      }
      if (rerunRequested && rerunEntryId !== undefined) {
        send(409, { error: 'A different rerun is already requested.' })
        return
      }
      const repeated = rerunRequested
      rerunRequested = true
      response.once('finish', () => {
        if (closed || rerunStarted) return
        rerunStarted = true
        try {
          controls.rerun!()
        } catch (error) {
          fault ??= error instanceof Error ? error : new Error(String(error))
        }
      })
      send(202, {
        version: 1,
        protocol: 'next-test-control',
        command: 'rerun',
        runId,
        status: repeated ? 'already-requested' : 'accepted',
      })
      return
    }
    const cancellation = /^\/v1\/runs\/([^/]+)\/cancel$/.exec(request.url ?? '')
    if (controls && cancellation) {
      if (request.method !== 'POST') {
        response.setHeader('allow', 'POST')
        request.resume()
        send(405, { error: 'Run cancellation requires POST.' })
        return
      }
      request.resume()
      let runId: string
      try {
        runId = decodeURIComponent(cancellation[1])
      } catch {
        send(400, { error: 'Invalid cancellation run ID.' })
        return
      }
      if (!run || run.id !== runId || run.status !== 'running') {
        send(409, {
          error: 'Cancellation requires the active running test run.',
        })
        return
      }
      const repeated = cancellationRequested
      cancellationRequested = true
      // Flush an acknowledgement before abort can dispose this API and its
      // sockets. A retried request can still acknowledge an earlier disconnect.
      response.once('finish', () => {
        if (closed || cancellationStarted) return
        cancellationStarted = true
        try {
          controls.cancelRun()
        } catch (error) {
          fault ??= error instanceof Error ? error : new Error(String(error))
        }
      })
      send(202, {
        version: 1,
        protocol: 'next-test-control',
        command: 'cancel',
        runId,
        status: repeated ? 'already-requested' : 'accepted',
      })
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
      ...(controls
        ? {
            controls: {
              cancel: true,
              ...(controls.rerun ? { rerun: true } : {}),
            },
          }
        : {}),
      files,
      ...(controls?.rerunFile && fileRerunEntries().length
        ? {
            fileControls: {
              rerun: true,
              entries: fileRerunEntries().map((entry) => entry.id),
            },
          }
        : {}),
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
    prepareRun(selected: readonly TestEntry[]) {
      if (closed) throw new Error('Discovery API owner is closed.')
      if (!controls?.rerun && !controls?.rerunFile)
        throw new Error('Discovery API has no watch execution owner.')
      if (run?.status === 'running')
        throw new Error('Discovery API previous run has not settled.')
      files = selectedFiles(selected)
      cases.clear()
      run = undefined
      cancellationRequested = cancellationStarted = false
      rerunRequested = rerunStarted = false
      rerunEntryId = undefined
    },
    cancelledRunSettled() {
      if (closed) throw new Error('Discovery API owner is closed.')
      if (!controls?.rerun && !controls?.rerunFile)
        throw new Error('Discovery API has no watch execution owner.')
      // The watch owner calls this only after the cancelled generation's
      // workers and report owners have joined. It does not publish a report.
      if (run?.status === 'running') run.status = 'cancelled'
    },
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
