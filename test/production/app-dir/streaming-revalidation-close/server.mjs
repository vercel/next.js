import next from 'next'
import { createServer } from 'node:http'
import { AsyncLocalStorage } from 'node:async_hooks'
import { getState, createGate, releaseGate } from './state.cjs'

const requestStorage = new AsyncLocalStorage()
globalThis[Symbol.for('@next/request-context')] = {
  get: () => requestStorage.getStore(),
}
const port = Number(process.env.PORT)
const app = next({ dev: false, hostname: 'localhost', port })
await app.prepare()
const handler = app.getRequestHandler()

createServer(async (request, response) => {
  const url = new URL(request.url, 'http://localhost')
  const state = getState()
  if (url.pathname === '/_test/control') {
    let body = ''
    for await (const chunk of request) {
      body += chunk
    }
    const command = JSON.parse(body)
    for (const name of command.create ?? []) {
      createGate(name)
    }
    for (const name of command.release ?? []) {
      releaseGate(name)
    }
    if (command.stale !== undefined) {
      state.stale = command.stale
    }
    response.end('ok')
    return
  }
  if (url.pathname === '/_test/state') {
    response.setHeader('content-type', 'application/json')
    response.end(
      JSON.stringify({ events: state.events, requests: state.requests })
    )
    return
  }

  const lifecycle = {
    url: request.url,
    pending: 0,
    finished: false,
    handled: false,
  }
  state.requests.push(lifecycle)
  response.once('finish', () => {
    lifecycle.finished = true
  })
  try {
    await requestStorage.run(
      {
        waitUntil(promise) {
          lifecycle.pending++
          promise.then(
            () => lifecycle.pending--,
            (error) => {
              lifecycle.pending--
              console.error(error)
            }
          )
        },
      },
      () => handler(request, response)
    )
  } catch (error) {
    console.error(error)
    response.destroy(error)
  } finally {
    lifecycle.handled = true
  }
}).listen(port, () => {
  console.log('- Local: http://localhost:' + port)
  console.log('Revalidation server ready')
})
