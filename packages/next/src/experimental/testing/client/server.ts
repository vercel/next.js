import { randomBytes } from 'node:crypto'
import { AssertionError } from 'node:assert'
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http'
import type { Socket } from 'node:net'
import type { CompiledBrowserClientTestArtifact } from '../contracts'
import type {
  ClientConfiguration,
  ClientMessage,
  ClientBrowserCommand,
  ClientCommandAttemptOrigin,
} from './protocol'
import { assertClientIdentity, isClientCommandAttemptOrigin } from './protocol'
import { createClientAssetReader } from './assets'
import { createClientSnapshotAccess } from './snapshot-access'
import { createClientSourceMapResolver } from './source-maps'
import { mapClientDiagnosticStack } from './helper-diagnostics'
import { ClientBrowserActionError } from './action-error'

type Completion = Extract<ClientMessage, { type: 'complete' }>
function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}
async function body(request: IncomingMessage) {
  let bytes = 0
  const chunks: Buffer[] = []
  for await (const chunk of request) {
    bytes += chunk.length
    if (bytes > 4 * 1024 * 1024)
      throw new Error('Browser Mode transport exceeded the message limit.')
    chunks.push(chunk)
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown
}

/** A dedicated loopback server, never a route on the tested Next application. */
export async function createClientServer(options: {
  artifact: CompiledBrowserClientTestArtifact
  testFrame?: boolean
  userCancelSignal?: AbortSignal
  configuration: Omit<
    ClientConfiguration,
    'authorization' | 'rpcURL' | 'sourceMaps'
  >
  onBrowserCommand?(
    command: ClientBrowserCommand,
    admit: () => void,
    origin?: ClientCommandAttemptOrigin
  ): Promise<unknown>
  onMessage(
    message: Exclude<ClientMessage, { type: 'snapshot' | 'browser-command' }>
  ): unknown | Promise<unknown>
  onFailure(error: unknown): void
}) {
  const { artifact, configuration } = options
  if (
    configuration.entryId !== artifact.entryId ||
    configuration.revision !== artifact.revision ||
    configuration.sourceHash !== artifact.sourceHash ||
    configuration.filePath !== artifact.client.sourceFile ||
    !configuration.ownerToken ||
    (configuration.userCancellation === true) !==
      (options.userCancelSignal !== undefined)
  )
    throw new Error(
      'Browser Mode server owner does not match its compiled artifact.'
    )
  const assets = await createClientAssetReader(artifact)
  const snapshots = await createClientSnapshotAccess(
    configuration.filePath,
    configuration.sourceHash
  )
  const token = randomBytes(24).toString('hex'),
    authorization = `Bearer ${randomBytes(32).toString('hex')}`
  const prefix = `/${token}/`,
    cookie = `next-test-client=${token}`
  let origin = '',
    closing = false,
    busy = false,
    nativeAction = false,
    sequence = 0,
    terminal: unknown,
    completed = false
  let resolveComplete!: (value: Completion) => void,
    rejectComplete!: (error: unknown) => void
  const completion = new Promise<Completion>((resolve, reject) => {
    resolveComplete = resolve
    rejectComplete = reject
  })
  completion.catch(() => {})
  const sockets = new Set<Socket>()
  const socketClosures = new Set<Promise<void>>()
  const handlers = new Set<Promise<void>>()
  const nativeActions = new Set<object>()
  const fail = (error: unknown) => {
    terminal ??= error
    rejectComplete(error)
    try {
      options.onFailure(error)
    } catch (observerError) {
      terminal = new AggregateError(
        [terminal, observerError],
        'Browser Mode failure observer failed.'
      )
      rejectComplete(terminal)
    }
  }
  let controlWaitStarted = false,
    controlWaitFinished = false,
    controlClosed = false,
    controlReplyValue: boolean | undefined,
    finalizedUserCancellation = false
  let resolveControlWait!: (cancelled: boolean) => void
  const controlWait = options.userCancelSignal
    ? new Promise<boolean>((resolve) => {
        resolveControlWait = resolve
      })
    : undefined
  function releaseControlWait(cancelled: boolean) {
    if (controlWait && controlReplyValue === undefined) {
      controlReplyValue = cancelled
      resolveControlWait(cancelled)
    }
  }
  const cancelByUser = () => {
    if (!controlClosed) releaseControlWait(true)
  }
  options.userCancelSignal?.addEventListener('abort', cancelByUser, {
    once: true,
  })
  if (options.userCancelSignal?.aborted) cancelByUser()
  async function handle(request: IncomingMessage, response: ServerResponse) {
    response.setHeader('X-Content-Type-Options', 'nosniff')
    response.setHeader('Cache-Control', 'no-store')
    // The test realm executes authored JavaScript and the pinned snapshot
    // loader evaluates the JavaScript assignments in saved external snapshots.
    response.setHeader(
      'Content-Security-Policy',
      "default-src 'none'; script-src 'self' 'unsafe-eval'; connect-src 'self' http: https:; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; " +
        (options.testFrame
          ? "frame-src 'self'; frame-ancestors 'self'"
          : "frame-ancestors 'none'")
    )
    try {
      if (closing || request.headers.host !== new URL(origin).host) {
        response.writeHead(404)
        response.end()
        return
      }
      const url = new URL(request.url ?? '/', origin)
      if (url.origin !== origin || url.search || url.hash) {
        response.writeHead(404)
        response.end()
        return
      }
      if (
        options.testFrame &&
        request.method === 'GET' &&
        url.pathname === `${prefix}host`
      ) {
        response.setHeader(
          'Set-Cookie',
          `${cookie}; Path=/; HttpOnly; SameSite=Strict`
        )
        response.setHeader('Content-Type', 'text/html; charset=utf-8')
        response.end(
          '<!doctype html><html><head><style>html,body{width:100%;height:100%;margin:0;padding:0}iframe{display:block;width:100%;height:100%;border:0}</style><link rel="icon" href="data:,"></head><body><iframe src="about:blank"></iframe></body></html>'
        )
        return
      }
      if (request.method === 'GET' && url.pathname === prefix) {
        response.setHeader(
          'Set-Cookie',
          `${cookie}; Path=/; HttpOnly; SameSite=Strict`
        )
        response.setHeader('Content-Type', 'text/html; charset=utf-8')
        const assetURL = (file: string) =>
          `/_next/${file.split('/').map(encodeURIComponent).join('/')}`
        response.end(
          `<!doctype html><html><head><style>
html {
  padding: 0;
  margin: 0;
}
body {
  padding: 0;
  margin: 0;
  min-height: 100vh;
}
</style>${artifact.client.styles.map((file) => `<link rel="stylesheet" href="${assetURL(file)}">`).join('')}<link rel="icon" href="data:,"></head><body>${artifact.client.scripts.map((file) => `<script defer src="${assetURL(file)}"></script>`).join('')}</body></html>`
        )
        return
      }
      if (
        !request.headers.cookie
          ?.split(';')
          .map((value) => value.trim())
          .includes(cookie)
      ) {
        response.writeHead(404)
        response.end()
        return
      }
      if (request.method === 'GET' && url.pathname === `${prefix}config`) {
        response.setHeader('Content-Type', 'application/json')
        response.end(
          JSON.stringify({
            ...configuration,
            authorization,
            rpcURL: `${origin}${prefix}rpc`,
            sourceMaps,
          } satisfies ClientConfiguration)
        )
        return
      }
      if (request.method === 'GET' && url.pathname.startsWith('/_next/')) {
        const file = url.pathname
          .slice('/_next/'.length)
          .split('/')
          .map(decodeURIComponent)
          .join('/')
        if (!artifact.files.includes(file)) {
          response.writeHead(404)
          response.end()
          return
        }
        const bytes = await assets.read(file)
        response.setHeader(
          'Content-Type',
          file.endsWith('.js')
            ? 'application/javascript; charset=utf-8'
            : file.endsWith('.css')
              ? 'text/css; charset=utf-8'
              : file.endsWith('.json') || file.endsWith('.map')
                ? 'application/json'
                : 'application/octet-stream'
        )
        response.end(bytes)
        return
      }
      if (
        controlWait &&
        request.method === 'POST' &&
        url.pathname === `${prefix}rpc/user-cancellation`
      ) {
        if (
          request.headers.authorization !== authorization ||
          request.headers.origin !== origin ||
          request.headers['content-type'] !== 'application/json'
        )
          throw new Error('Invalid Browser Mode scheduling control request.')
        const value = await body(request)
        if (!record(value))
          throw new Error('Invalid Browser Mode scheduling control message.')
        assertClientIdentity(value, configuration)
        const keys = Object.keys(value).sort().join(',')
        const identityKeys = 'entryId,ownerToken,revision,runId,type,version'
        if (value.type === 'wait' && keys === identityKeys) {
          if (controlWaitStarted || controlClosed || completed)
            throw new Error('Duplicate Browser Mode scheduling control wait.')
          controlWaitStarted = true
          response.setHeader('Content-Type', 'application/json')
          // Admit the actual control owner before collection. The final JSON
          // body remains pending independently of the ordinary RPC FIFO.
          response.write(' ')
          const cancelled = await controlWait
          if (!response.destroyed) response.end(JSON.stringify({ cancelled }))
          controlWaitFinished = true
          return
        }
        if (
          value.type === 'close' &&
          keys === 'delivered,' + identityKeys &&
          typeof value.delivered === 'boolean'
        ) {
          if (
            !controlWaitStarted ||
            controlClosed ||
            completed ||
            (value.delivered && controlReplyValue !== true)
          )
            throw new Error('Invalid Browser Mode scheduling control close.')
          controlClosed = true
          options.userCancelSignal?.removeEventListener('abort', cancelByUser)
          releaseControlWait(false)
          finalizedUserCancellation = value.delivered
          response.setHeader('Content-Type', 'application/json')
          response.end(JSON.stringify({ cancelled: value.delivered }))
          return
        }
        throw new Error('Invalid Browser Mode scheduling control message.')
      }
      if (request.method !== 'POST' || url.pathname !== `${prefix}rpc`) {
        response.writeHead(404)
        response.end()
        return
      }
      if (
        request.headers.authorization !== authorization ||
        request.headers.origin !== origin ||
        request.headers['content-type'] !== 'application/json'
      )
        throw new Error('Unauthorized Browser Mode RPC.')
      if (busy || completed)
        throw new Error(
          'Browser Mode RPC arrived concurrently or after completion.'
        )
      busy = true
      let ownsAdmission = true,
        ownsNativeAction = false
      let ownedNativeRecord: object | undefined
      try {
        const raw = await body(request)
        if (!record(raw))
          throw new Error('Invalid Browser Mode transport message.')
        assertClientIdentity(raw, configuration)
        if (raw.sequence !== sequence++)
          throw new Error(
            'Duplicate or out-of-order Browser Mode transport message.'
          )
        const message = raw as unknown as ClientMessage
        if (
          message.type === 'browser-command' &&
          message.origin !== undefined &&
          (configuration.caseScheduling !== 'concurrent-v1' ||
            !isClientCommandAttemptOrigin(message.origin) ||
            message.origin.fileId !== configuration.entryId)
        )
          throw new Error('Invalid Browser Mode command attempt origin.')
        if (
          nativeAction &&
          message.type !== 'output' &&
          !(
            configuration.captureTaskResults === true &&
            message.type === 'task-update'
          )
        )
          throw new Error(
            'Only Browser console output or captured task updates may pass a pending native action.'
          )
        if (
          nativeActions.size &&
          ![
            'output',
            'case-start',
            'case-end',
            'case-final',
            'suite-end',
            'failure',
            'complete',
          ].includes(message.type) &&
          !(
            configuration.captureTaskResults === true &&
            message.type === 'task-update'
          ) &&
          !(message.type === 'browser-command' && message.origin)
        )
          throw new Error(
            'Browser Mode RPC cannot pass pending attempt commands.'
          )
        let result: unknown = null
        if (message.type === 'snapshot')
          result = await snapshots.request(message.method, message.args)
        else if (message.type === 'artifact') {
          try {
            result = await options.onMessage(message)
          } catch (error) {
            if (!(error instanceof AssertionError)) throw error
            const values: Record<string, unknown> = {
              name: error.name,
              message: error.message,
              stack: error.stack,
              ...Object.fromEntries(
                Object.getOwnPropertyNames(error).map((key) => [
                  key,
                  Reflect.get(error, key),
                ])
              ),
            }
            response.setHeader('Content-Type', 'application/json')
            response.end(
              JSON.stringify({
                artifactError: Object.entries(values).map(([key, value]) => ({
                  key,
                  value,
                })),
              })
            )
            return
          }
        } else if (message.type === 'browser-command') {
          if (!options.onBrowserCommand)
            throw new Error('Browser Mode commands are unavailable.')
          try {
            const admit = () => {
              if (!ownsAdmission || ownsNativeAction || nativeAction)
                throw new Error('Invalid Browser Mode native action admission.')
              if (message.origin) {
                ownedNativeRecord = {}
                nativeActions.add(ownedNativeRecord)
              } else {
                if (nativeActions.size)
                  throw new Error(
                    'Invalid Browser Mode serial command admission.'
                  )
                nativeAction = true
              }
              response.setHeader('Content-Type', 'application/json')
              response.flushHeaders()
              // Gecko exposes a fetch Response after its first body bytes. JSON
              // whitespace admits observations without completing the reply.
              response.write(' ')
              ownsNativeAction = true
              ownsAdmission = busy = false
            }
            result = message.origin
              ? await options.onBrowserCommand(
                  message.command,
                  admit,
                  message.origin
                )
              : await options.onBrowserCommand(message.command, admit)
          } catch (error) {
            if (!(error instanceof ClientBrowserActionError)) throw error
            if (!response.headersSent)
              response.setHeader('Content-Type', 'application/json')
            response.end(JSON.stringify({ actionError: error.actionError }))
            return
          }
        } else {
          if (
            ![
              'collected',
              'output',
              'case-start',
              'case-end',
              'task-update',
              'suite-end',
              'failure',
              'complete',
            ].includes(message.type) &&
            !(
              configuration.caseScheduling === 'concurrent-v1' &&
              message.type === 'case-final'
            )
          )
            throw new Error('Unknown Browser Mode transport message.')
          await options.onMessage(message)
          if (message.type === 'complete') {
            await snapshots.verifySource()
            await assets.verify()
            completed = true
            response.once('finish', () => resolveComplete(message))
          }
        }
        if (!response.headersSent)
          response.setHeader('Content-Type', 'application/json')
        response.end(JSON.stringify({ value: result }))
      } finally {
        if (ownsAdmission) busy = false
        if (ownedNativeRecord) nativeActions.delete(ownedNativeRecord)
        else if (ownsNativeAction) nativeAction = false
      }
    } catch (error) {
      fail(error)
      if (!response.headersSent)
        response.writeHead(400, { 'Content-Type': 'application/json' })
      response.end(JSON.stringify({ error: 'Browser Mode transport failed.' }))
    }
  }
  const server = createServer((request, response) => {
    if (closing) {
      request.socket.destroy()
      return
    }
    const operation = handle(request, response)
    handlers.add(operation)
    void operation.then(
      () => handlers.delete(operation),
      (error) => {
        handlers.delete(operation)
        fail(error)
      }
    )
  })
  server.on('connection', (socket) => {
    sockets.add(socket)
    const closed = new Promise<void>((resolve) =>
      socket.once('close', () => {
        sockets.delete(socket)
        socketClosures.delete(closed)
        resolve()
      })
    )
    socketClosures.add(closed)
    // A connection accepted by the OS before close can be delivered afterward.
    if (closing) socket.destroy()
  })
  let disposal: Promise<void> | undefined
  function dispose() {
    return (disposal ??= (async () => {
      closing = true
      options.userCancelSignal?.removeEventListener('abort', cancelByUser)
      releaseControlWait(false)
      const stopped = new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve()))
      )
      for (const socket of sockets) socket.destroy()
      await stopped
      // Socket closure alone does not close asynchronous parent filesystem/RPC work.
      while (handlers.size || socketClosures.size)
        await Promise.allSettled([...handlers, ...socketClosures])
      if (sockets.size)
        throw new Error('Browser Mode HTTP sockets survived server closure.')
    })())
  }
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      server.on('error', fail)
      server.off('error', reject)
      resolve()
    })
  })
  const address = server.address()
  if (!address || typeof address === 'string')
    throw new Error('Browser Mode server has no loopback port.')
  origin = `http://127.0.0.1:${address.port}`
  let sourceMaps: ClientConfiguration['sourceMaps']
  try {
    sourceMaps = await assets.sourceMaps(origin)
  } catch (error) {
    await dispose()
    throw error
  }
  const mapper = createClientSourceMapResolver({ ...configuration, sourceMaps })
  return {
    url: `${origin}${prefix}`,
    ...(options.testFrame ? { hostURL: `${origin}${prefix}host` } : {}),
    completion,
    userCancellationFinalized() {
      return controlClosed && controlWaitFinished && finalizedUserCancellation
    },
    async verify() {
      await snapshots.verify()
      await assets.verify()
    },
    mapStack(stack: string) {
      return mapClientDiagnosticStack(stack, mapper)
    },
    fail,
    assertClean() {
      if (terminal) throw terminal
      if (
        !completed ||
        busy ||
        (controlWait && (!controlClosed || !controlWaitFinished))
      )
        throw new Error(
          'Browser Mode transport has no clean terminal completion.'
        )
    },
    dispose,
  }
}
