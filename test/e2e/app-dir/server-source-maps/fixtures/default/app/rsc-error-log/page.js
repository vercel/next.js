export const dynamic = 'force-dynamic'

function logError() {
  const error = new Error('Boom')
  console.error(error)
}

export default function Page() {
  logError()
  return null
}
