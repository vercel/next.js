// IPC need to be the first import to allow it to catch errors happening during
// the other imports
import startOperationStreamHandler from './operation-stream'

import type { ClientRequest, IncomingMessage, Server } from 'node:http'
import type { ServerResponse } from 'node:http'
import { Buffer } from 'node:buffer'

import type { RenderData } from 'types/turbopack'
import { createServer, makeRequest } from '../internal/server'
import { toPairs } from '../internal/headers'

type Handler = (data: {
  request: IncomingMessage
  response: ServerResponse<IncomingMessage>
  query: string
  params: Record<string, string | string[]>
  path: string
}) => Promise<void>

type Operation = {
  clientRequest: ClientRequest
  clientResponsePromise: Promise<IncomingMessage>
  apiOperation: Promise<void>
  server: Server
}

type ResponseHeaders = {
  status: number
  headers: [string, string][]
}

export default function startHandler(handler: Handler): void {
  startOperationStreamHandler(
    async (renderData: RenderData, respond, reportError) => {
      const operationPromise = (async function createOperation() {
        const server = await createServer()

        const {
          clientRequest,
          clientResponsePromise,
          serverRequest,
          serverResponse,
        } = await makeRequest(
          server,
          renderData.method,
          renderData.path,
          renderData.rawQuery,
          renderData.rawHeaders,
          renderData.data?.serverInfo
        )

        return {
          clientRequest,
          server,
          clientResponsePromise,
          apiOperation: handler({
            request: serverRequest,
            response: serverResponse,
            query: renderData.rawQuery,
            params: renderData.params,
            path: renderData.path,
          }),
        }
      })()

      function handleClientResponse(
        server: Server,
        clientResponse: IncomingMessage
      ) {
        const responseHeaders: ResponseHeaders = {
          status: clientResponse.statusCode!,
          headers: toPairs(clientResponse.rawHeaders),
        }

        const channel = respond(responseHeaders)

        clientResponse.on('data', (chunk) => {
          channel.chunk(chunk)
        })

        clientResponse.once('end', () => {
          channel.end()
          server.close()
        })

        clientResponse.once('error', (err) => {
          reportError(err)
        })
      }

      /**
       * Ends an operation by writing the response body to the client and waiting for the Next.js API resolver to finish.
       */
      async function endOperation(operation: Operation, body: Buffer) {
        operation.clientRequest.end(body)

        try {
          await operation.apiOperation
        } catch (error) {
          await reportError(error)
          return
        }
      }

      return {
        streamRequest: false,
        onBody: async (body) => {
          const operation = await operationPromise
          await Promise.all([
            endOperation(operation, body),
            operation.clientResponsePromise.then((clientResponse) =>
              handleClientResponse(operation.server, clientResponse)
            ),
          ])
        },
      }
    }
  )
}
