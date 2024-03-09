import http from 'http'
import type { IncomingMessage } from 'http'
import type { ProxyRequest, ProxyResponse, ProxyServer } from './types'
import { UNHANDLED } from './types'
import type { FetchHandler } from './fetch-api'
import { handleFetch } from './fetch-api'

async function readBody(req: IncomingMessage): Promise<Buffer> {
  const acc: Buffer[] = []

  for await (const chunk of req) {
    acc.push(chunk)
  }

  return Buffer.concat(acc)
}

export async function createProxyServer({
  onFetch,
}: {
  onFetch?: FetchHandler
}): Promise<ProxyServer> {
  const server = http.createServer(async (req, res) => {
    if (req.url !== '/') {
      res.writeHead(404)
      res.end()
      return
    }

    let json: ProxyRequest | undefined
    try {
      json = JSON.parse((await readBody(req)).toString('utf-8')) as ProxyRequest
    } catch (e) {
      res.writeHead(400)
      res.end()
      return
    }

    const { api } = json

    let response: ProxyResponse | undefined
    switch (api) {
      case 'fetch':
        if (onFetch) {
          response = await handleFetch(json, onFetch)
        }
        break
      default:
        break
    }
    if (!response) {
      response = UNHANDLED
    }

    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.write(JSON.stringify(response))
    res.end()
  })

  await new Promise((resolve) => {
    server.listen(0, 'localhost', () => {
      resolve(undefined)
    })
  })

  const address = server.address()
  if (!address || typeof address !== 'object') {
    server.close()
    throw new Error('Failed to create a proxy server')
  }
  const port = address.port

  const fetchWith: ProxyServer['fetchWith'] = (input, init, testData) => {
    const request = new Request(input, init)
    request.headers.set('Next-Test-Proxy-Port', String(port))
    request.headers.set('Next-Test-Data', testData ?? '')
    return fetch(request)
  }

  return { port, close: () => server.close(), fetchWith }
}
