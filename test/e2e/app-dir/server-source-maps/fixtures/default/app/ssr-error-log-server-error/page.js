import { Client } from './client'

function createServerError() {
  return new Error('ssr-error-log-server-error')
}

export default function Page() {
  const error = createServerError()
  return <Client error={error} />
}
