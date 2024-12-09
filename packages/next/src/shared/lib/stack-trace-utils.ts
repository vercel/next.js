// Hide the method name when showing a stack trace in the error overlay or when displaying a stack trace in the console.
export function isHiddenMethodName(methodName: string) {
  return /^(?:Object\.|Module\.)?(?:<anonymous>|eval|__TURBOPACK__module__evaluation__)$/.test(
    methodName
  )
}
