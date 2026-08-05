import { type Instrumentation } from 'next'

export const onRequestError: Instrumentation.onRequestError = (
  err,
  request,
  context
) => {
  console.log(`[instrumentation] onRequestError:${request.path}`)

  fetch(`http://localhost:${process.env.PORT}/write-log`, {
    method: 'POST',
    body: JSON.stringify({
      message: (err as Error).message,
      request,
      context,
    }),
    headers: {
      'Content-Type': 'application/json',
    },
  })
}
