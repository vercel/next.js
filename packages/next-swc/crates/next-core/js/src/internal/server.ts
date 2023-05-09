import type { ClientRequest, IncomingMessage, Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import http, { ServerResponse } from 'node:http'
import { headersFromEntries } from './headers'

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
  rawHeaders?: [string, string][]
): Promise<{
  clientRequest: ClientRequest
  clientResponsePromise: Promise<IncomingMessage>
  serverRequest: IncomingMessage
  serverResponse: ServerResponse<IncomingMessage>
}> {
  return new Promise((resolve, reject) => {
    let clientRequest: ClientRequest | null = null
    let clientResponseResolve: (value: IncomingMessage) => void
    let clientResponseReject: (error: Error) => void
    const clientResponsePromise = new Promise<IncomingMessage>(
      (resolve, reject) => {
        clientResponseResolve = resolve
        clientResponseReject = reject
      }
    )
    let serverRequest: IncomingMessage | null = null
    let serverResponse: ServerResponse<IncomingMessage> | null = null

    const maybeResolve = () => {
      if (
        clientRequest != null &&
        serverRequest != null &&
        serverResponse != null
      ) {
        cleanup()
        resolve({
          clientRequest,
          clientResponsePromise,
          serverRequest,
          serverResponse,
        })
      }
    }

    const cleanup = () => {
      server.removeListener('error', errorListener)
      server.removeListener('request', requestListener)
    }

    const errorListener = (err: Error) => {
      cleanup()
      reject(err)
    }

    const requestListener = (
      req: IncomingMessage,
      res: ServerResponse<IncomingMessage>
    ) => {
      serverRequest = req
      serverResponse = res
      maybeResolve()
    }

    const cleanupClientResponse = () => {
      if (clientRequest != null) {
        clientRequest.removeListener('response', responseListener)
        clientRequest.removeListener('error', clientResponseErrorListener)
      }
    }

    const clientResponseErrorListener = (err: Error) => {
      cleanupClientResponse()
      clientResponseReject(err)
    }

    const responseListener = (res: IncomingMessage) => {
      cleanupClientResponse()
      clientResponseResolve(res)
    }

    server.once('request', requestListener)
    server.once('error', errorListener)

    const address = server.address() as AddressInfo

    clientRequest = http.request({
      host: 'localhost',
      port: address.port,
      method,
      path:
        rawQuery != null && rawQuery.length > 0 ? `${path}?${rawQuery}` : path,
      headers: rawHeaders != null ? headersFromEntries(rawHeaders) : undefined,
    })

    // Otherwise Node.js waits for the first chunk of data to be written before sending the request.
    clientRequest.flushHeaders()

    clientRequest.once('response', responseListener)
    clientRequest.once('error', clientResponseErrorListener)
  })
}
