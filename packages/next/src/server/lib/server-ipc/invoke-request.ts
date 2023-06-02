import { IncomingMessage } from 'http'
import { filterReqHeaders } from './utils'

export const invokeRequest = async (
  targetUrl: string,
  requestInit: {
    headers: IncomingMessage['headers']
    method: IncomingMessage['method']
  },
  readableBody?: import('stream').Readable
) => {
  const invokeHeaders = filterReqHeaders({
    ...requestInit.headers,
  }) as IncomingMessage['headers']

  const invokeRes = await new Promise<IncomingMessage>(
    (resolveInvoke, rejectInvoke) => {
      const http = require('http') as typeof import('http')

      try {
        const invokeReq = http.request(
          targetUrl,
          {
            headers: invokeHeaders,
            method: requestInit.method,
          },
          (res) => {
            resolveInvoke(res)
          }
        )
        invokeReq.on('error', (err) => {
          rejectInvoke(err)
        })

        if (requestInit.method !== 'GET' && requestInit.method !== 'HEAD') {
          if (readableBody) {
            readableBody.pipe(invokeReq)
            readableBody.on('close', () => {
              invokeReq.end()
            })
          }
        } else {
          invokeReq.end()
        }
      } catch (err) {
        rejectInvoke(err)
      }
    }
  )

  return invokeRes
}
