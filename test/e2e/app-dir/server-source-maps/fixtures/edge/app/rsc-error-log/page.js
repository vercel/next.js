function logError() {
  console.error(new Error('rsc-error-log'))
}

export default function Page() {
  logError()
  return null
}
