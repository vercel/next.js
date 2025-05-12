import { connection } from 'next/server'

function logError(cause) {
  const error = new Error('rsc-error-log-cause', { cause })
  console.error(error)
}

export default async function Page() {
  await connection()

  const error = new Error('Boom')
  logError(error)
  return null
}
