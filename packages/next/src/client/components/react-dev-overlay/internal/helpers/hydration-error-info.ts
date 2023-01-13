export let hydrationErrorInfo: string | undefined

type UnpatchConsoleError = () => void
export function patchConsoleError(): UnpatchConsoleError {
  const prev = console.error
  // Hide invalid hook call warning when calling component
  console.error = function (
    msg,
    serverContent,
    clientContent,
    _componentStack
  ) {
    if (
      msg === 'Warning: Text content did not match. Server: "%s" Client: "%s"%s'
    ) {
      hydrationErrorInfo = ` Server: "${serverContent}" Client: "${clientContent}"`
    }

    // @ts-expect-error argument is defined
    prev.apply(console, arguments)
  }

  return () => {
    console.error = prev
  }
}
