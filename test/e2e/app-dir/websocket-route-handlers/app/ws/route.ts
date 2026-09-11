import {
  NextResponse,
  type WebSocketHooks,
  type WebSocketMessage,
  type WebSocketPeer,
} from 'next/server'
import { cookies } from 'next/headers'

const state = globalThis as typeof globalThis & {
  wsExecutions?: Map<string, number>
}
const sharedResponses = new Map<string, NextResponse<null>>()

export async function GET(request: Request) {
  const url = new URL(request.url)
  const executionKey = url.searchParams.get('execution-key') || 'default'
  const executions = (state.wsExecutions ||= new Map())
  const executionCount = (executions.get(executionKey) || 0) + 1
  executions.set(executionKey, executionCount)

  if (request.headers.get('authorization') !== 'Bearer secret') {
    return new Response('unauthorized', { status: 401 })
  }
  if (url.searchParams.has('decline')) {
    return new Response('declined', {
      status: 401,
      headers: { 'x-response-layer': 'handler-decline' },
    })
  }

  const cookieStore = await cookies()
  const sharedKey = url.searchParams.get('shared')
  if (sharedKey) {
    const requestCookie = url.searchParams.get('request-cookie')
    if (requestCookie) cookieStore.set('request-cookie', requestCookie)
    let response = sharedResponses.get(sharedKey)
    if (!response) {
      response = NextResponse.upgrade({
        open(peer) {
          peer.send(`shared:${sharedKey}`)
        },
      })
      sharedResponses.set(sharedKey, response)
    }
    return response
  }

  const hooks: WebSocketHooks = {
    async open(peer: WebSocketPeer) {
      const hookError = url.searchParams.get('hook-error')
      if (hookError) {
        peer.send('connected')
        throw new Error(hookError)
      }
      if (url.searchParams.has('request-store-error')) {
        peer.send('connected')
        await cookies()
        return
      }
      if (url.searchParams.has('request-check')) {
        peer.send(
          JSON.stringify({
            executions: executionCount,
            sameSignal: peer.request.signal === request.signal,
            url: peer.request.url,
            remoteAddress: peer.remoteAddress,
            bufferedAmount: peer.bufferedAmount,
          })
        )
        return
      }
      if (url.searchParams.has('header-check')) {
        peer.send(
          JSON.stringify({
            internalCookieHeader: request.headers.get(
              'x-middleware-set-cookie'
            ),
            nextDataHeader: request.headers.get('x-nextjs-data'),
            forgedCookie: cookieStore.get('forged')?.value || null,
          })
        )
        return
      }
      peer.send(`connected:${executionCount}`)
    },
    message(peer: WebSocketPeer, message: WebSocketMessage) {
      peer.send(message.rawData)
    },
  }

  const response = NextResponse.upgrade(hooks, {
    protocol: url.searchParams.get('protocol') || undefined,
  })
  response.headers.set('x-response-layer', 'handler')
  response.cookies.set('websocket', 'accepted')
  return response
}
