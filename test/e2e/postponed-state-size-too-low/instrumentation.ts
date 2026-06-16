import { type Instrumentation } from 'next'

export const onRequestError: Instrumentation.onRequestError = (err) => {
  const error = err as Error & { digest?: string }
  console.log(
    `[instrumentation] onRequestError, digest: ${error.digest}, message: "${error.message}"`
  )
}
