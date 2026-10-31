function logError() {
  // The message ends with text that looks like a file location. A refused
  // connection produces such a message, for example `connect ECONNREFUSED
  // ::1:45999`. The route name stays in front of it, so the assertions of the
  // test match this error only.
  console.error(
    new Error('rsc-error-log-location-message: connect ECONNREFUSED ::1:45999')
  )
}

export default function Page() {
  logError()
  return null
}
