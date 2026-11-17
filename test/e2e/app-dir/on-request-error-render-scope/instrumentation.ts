import type { Instrumentation } from 'next'

export const onRequestError: Instrumentation.onRequestError = async (
  error,
  request,
  context
) => {
  const before = Date.now()
  await Promise.resolve()
  const after = Date.now()
  const date = new Date().toISOString()
  const random = Math.random()
  console.log(
    'ERROR_REPORT:' +
      JSON.stringify({
        message: error instanceof Error ? error.message : String(error),
        path: request.path,
        renderSource: context.renderSource,
        before,
        after,
        date,
        random,
      })
  )
}
