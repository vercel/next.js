import {
  NextResponse,
  type WebSocketCloseDetails,
  type WebSocketError,
  type WebSocketHooks,
  type WebSocketMessage,
  type WebSocketPeer,
} from 'next/server'
import { cookies } from 'next/headers'

const state = globalThis as typeof globalThis & {
  wsExecutions?: Map<string, number>
  wsCloseEvents?: number
  wsErrors?: number
  wsActiveMessageHooks?: number
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const executionKey = url.searchParams.get('execution-key') || 'default'
  const executions = (state.wsExecutions ||= new Map())
  const executionCount = (executions.get(executionKey) || 0) + 1
  executions.set(executionKey, executionCount)

  if (request.headers.get('authorization') !== 'Bearer secret') {
    return new Response('unauthorized', {
      status: 401,
      headers: { 'x-auth-result': 'rejected' },
    })
  }

  const cookieStore = await cookies()
  const internalCookieHeader = request.headers.get('x-middleware-set-cookie')

  const hookError = url.searchParams.get('hook-error')
  const hooks: WebSocketHooks = {
    open(peer: WebSocketPeer) {
      if (hookError === 'throw') throw new Error('open hook threw')
      if (hookError === 'reject') {
        return Promise.reject(new Error('open hook rejected'))
      }
      peer.send(`connected:${executionCount}`)
    },
    async message(peer: WebSocketPeer, message: WebSocketMessage) {
      const text = message.text()
      if (url.searchParams.has('serialize-hooks')) {
        state.wsActiveMessageHooks = (state.wsActiveMessageHooks || 0) + 1
        const activeHooks = state.wsActiveMessageHooks
        await new Promise<void>((resolve) => setImmediate(resolve))
        peer.send(`serialized:${text}:${activeHooks}`)
        state.wsActiveMessageHooks--
      } else if (text === 'object') {
        peer.send({ user: 'server', message: 'object response' })
      } else if (text === 'views') {
        peer.send({
          text,
          bytes: Array.from(message.uint8Array()),
          arrayBufferLength: message.arrayBuffer().byteLength,
        })
      } else if (text.startsWith('subscribe:')) {
        peer.subscribe(text.slice('subscribe:'.length))
        peer.send('subscribed')
      } else if (text.startsWith('publish:')) {
        const [, topic, value] = text.split(':')
        peer.publish(topic, value)
        peer.send('published')
      } else {
        peer.send(message.rawData)
      }
    },
    close(_peer: WebSocketPeer, _details: WebSocketCloseDetails) {
      state.wsCloseEvents = (state.wsCloseEvents || 0) + 1
    },
    error(_peer: WebSocketPeer, _error: WebSocketError) {
      state.wsErrors = (state.wsErrors || 0) + 1
    },
  }

  if (url.searchParams.has('header-check')) {
    hooks.open = (peer) => {
      peer.send(
        JSON.stringify({
          internalCookieHeader,
          forgedCookie: cookieStore.get('forged')?.value || null,
        })
      )
    }
  }

  const allowedOrigin = url.searchParams.get('allowed-origin')
  const protocol = url.searchParams.get('protocol') || undefined
  const response = NextResponse.upgrade(hooks, {
    ...(allowedOrigin ? { allowedOrigins: [allowedOrigin] } : undefined),
    ...(protocol ? { protocol } : undefined),
  })
  response.headers.set('x-upgrade-result', 'accepted')
  response.cookies.set('websocket', 'accepted')
  response.cookies.set('websocket-secondary', 'accepted')
  return response
}
