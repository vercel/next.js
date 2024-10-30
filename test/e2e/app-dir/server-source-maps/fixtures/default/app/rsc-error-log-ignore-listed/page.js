import { run } from 'internal-pkg'

function logError() {
  const error = new Error('Boom')
  console.error(error)
}

export default function Page() {
  run(() => logError())
  return null
}
