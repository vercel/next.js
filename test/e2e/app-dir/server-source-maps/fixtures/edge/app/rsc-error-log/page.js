function logError() {
  console.error(new Error('Boom'))
}

export default function Page() {
  logError()
  return null
}
