import type { ClientRequest, IncomingMessage, Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import http, { ServerResponse } from 'node:http'
import { headersFromEntries, initProxiedHeaders } from './headers'

export type ServerInfo = Partial<{
  hostname: string
  port: number
  ip: string
  protocol: string
}>

/**
 * Creates a server that listens a random port.
 */
export function createServer(): Promise<Server> {
  return new Promise((resolve) => {
    const server = http.createServer()
    server.listen(0, () => {
      resolve(server)
    })
  })
}

/**
 * Creates a request to a server, and returns the (req, res) pairs from both
 * the client's and server's perspective.
 */
export function makeRequest(
  server: Server,
  method: string,
  path: string,
  rawQuery?: string,
  rawHeaders?: [string, string][],
  proxiedFor?: ServerInfo
): Promise<{
  clientRequest: ClientRequest
  clientResponsePromise: Promise<IncomingMessage>
  serverRequest: IncomingMessage
  serverResponse: ServerResponse<IncomingMessage>
}> {
  return new Promise((resolve, reject) => {
    let clientResponseResolve: (value: IncomingMessage) => void
    let clientResponseReject: (error: Error) => void
    const clientResponsePromise = new Promise<IncomingMessage>(
      (resolve, reject) => {
        clientResponseResolve = resolve
        clientResponseReject = reject
      }
    )

    const errorListener = (err: Error) => {
      server.removeListener('request', requestListener)
      reject(err)
    }

    const requestListener = (
      req: IncomingMessage,
      res: ServerResponse<IncomingMessage>
    ) => {
      server.removeListener('error', errorListener)
      resolve({
        clientRequest,
        clientResponsePromise,
        serverRequest: req,
        serverResponse: res,
      })
    }

    server.once('request', requestListener)
    server.once('error', errorListener)

    const address = server.address() as AddressInfo

    const headers = headersFromEntries(rawHeaders ?? [])
    initProxiedHeaders(headers, proxiedFor)

    const clientRequest = http.request({
      host: 'localhost',
      port: address.port,
      method,
      path: rawQuery?.length ? `${path}?${rawQuery}` : path,
      headers,
    })

    // Otherwise Node.js waits for the first chunk of data to be written before sending the request.
    clientRequest.flushHeaders()

    const clientResponseErrorListener = (err: Error) => {
      clientRequest.removeListener('response', responseListener)
      clientResponseReject(err)
    }

    const responseListener = (res: IncomingMessage) => {
      clientRequest.removeListener('error', clientResponseErrorListener)
      clientResponseResolve(res)
    }

    clientRequest.once('response', responseListener)
    clientRequest.once('error', clientResponseErrorListener)
  })
}
