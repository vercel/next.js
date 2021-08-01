import { EdgeRequest } from './request'
import { EdgeResponse } from './response'
import type { EdgeFunctionResult, RequestHandler } from './types'
import type { RequestData, ResponseData } from './types'

export async function adapter(params: {
  handler: RequestHandler
  request: RequestData
  response?: ResponseData
}) {
  return new Promise<EdgeFunctionResult>((topResolve, topReject) => {
    const resolveResponse = edgeFunctionToMiddleware(topResolve)
    let resolveHandler: {
      resolve: () => void
      reject: (err: Error) => void
    }

    const promise = new Promise<void>((resolve, reject) => {
      resolveHandler = { resolve: resolve, reject: reject }
    })

    const req = new EdgeRequest(params.request)
    const res = new EdgeResponse({
      url: params.request.url,
      method: params.request.method,
      headers: params.response?.headers,
      onHeadersSent: (event, response) => {
        resolveResponse({
          event,
          response,
          promise,
        })
      },
    })

    function next() {
      if (res.finished) {
        return
      }

      resolveResponse({
        event: 'next',
        response: res,
        promise,
      })
    }

    Promise.resolve(params.handler(req, res, next))
      .then(resolveHandler!.resolve)
      .catch((error) => {
        if (!res.finished) {
          topReject(error)
        } else {
          resolveHandler!.reject(error)
        }
      })
  })
}

function edgeFunctionToMiddleware(fn: (result: EdgeFunctionResult) => void) {
  return ({ event, response, promise }: EdgeFunctionResult) => {
    if (event !== 'next') {
      response.headers.set('x-middleware-effect', '1')
      if (response.location) {
        response.headers.set('x-middleware-redirect', response.location)
      } else if (response.rewriteLocation) {
        response.headers.set('x-middleware-rewrite', response.rewriteLocation)
      } else {
        response.headers.set('x-middleware-refresh', '1')
      }
    }

    fn({ event, response, promise })
  }
}
