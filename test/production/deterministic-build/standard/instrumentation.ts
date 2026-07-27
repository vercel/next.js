import { type Instrumentation } from 'next'

export const onRequestError: Instrumentation.onRequestError = (
  err,
  request,
  context
) => {
  console.error('onRequestError instrumentation called:', err)
}
