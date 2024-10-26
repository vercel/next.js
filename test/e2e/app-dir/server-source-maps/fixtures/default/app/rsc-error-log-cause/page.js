function logError(cause) {
  const error = new Error('Boom', { cause })
  console.error(error)
}

export default function Page() {
  const error = new Error('Boom')
  logError(error)
  return null
}
