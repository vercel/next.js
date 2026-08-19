import { type Instrumentation } from 'next'

export const onRequestError: Instrumentation.onRequestError = (err) => {
  console.log(`[instrumentation] onRequestError:${(err as Error).message}`)
}
