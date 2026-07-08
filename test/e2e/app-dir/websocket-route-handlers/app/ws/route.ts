import {
  NextResponse,
  type WebSocketCloseDetails,
  type WebSocketError,
  type WebSocketHooks,
  type WebSocketMessage,
  type WebSocketPeer,
} from 'next/server'

const state = globalThis as typeof globalThis & {
  wsExecutions?: Map<string, number>
  wsCloseEvents?: number
  wsErrors?: number
}

export function GET(request: Request) {
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

  const hookError = url.searchParams.get('hook-error')
  const hooks: WebSocketHooks = {
    open(peer: WebSocketPeer) {
      if (hookError === 'throw') throw new Error('open hook threw')
      if (hookError === 'reject') {
        return Promise.reject(new Error('open hook rejected'))
      }
      peer.send(`connected:${executionCount}`)
    },
    message(peer: WebSocketPeer, message: WebSocketMessage) {
      const text = message.text()
      if (text === 'object') {
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

  const response = NextResponse.upgrade(hooks)
  response.headers.set('x-upgrade-result', 'accepted')
  response.cookies.set('websocket', 'accepted')
  response.cookies.set('websocket-secondary', 'accepted')
  return response
}
