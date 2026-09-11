import type { Instrumentation } from 'next'

export const onRequestError: Instrumentation.onRequestError = (
  error,
  request,
  context
) => {
  console.log(
    '[websocket-on-request-error]',
    JSON.stringify({
      message: (error as Error).message,
      method: request.method,
      path: request.path,
      routePath: context.routePath,
      routeType: context.routeType,
    })
  )
}
