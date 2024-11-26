import { connection } from 'next/server'
import { run } from 'internal-pkg'

function logError() {
  const error = new Error('Boom')
  console.error(error)
}

export default async function Page() {
  await connection()

  run(() => logError())
  return null
}
