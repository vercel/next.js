export let hydrationErrorInfo: string | undefined

const knownHydrationWarnings = new Set([
  'Warning: Text content did not match. Server: "%s" Client: "%s"%s',
  'Warning: Expected server HTML to contain a matching <%s> in <%s>.%s',
  'Warning: Expected server HTML to contain a matching text node for "%s" in <%s>.%s',
  'Warning: Did not expect server HTML to contain a <%s> in <%s>.%s',
  'Warning: Did not expect server HTML to contain the text node "%s" in <%s>.%s',
])

export function patchConsoleError() {
  const prev = console.error
  console.error = function (
    msg,
    serverContent,
    clientContent,
    // TODO-APP: Display the component stack in the overlay
    _componentStack
  ) {
    if (knownHydrationWarnings.has(msg)) {
      hydrationErrorInfo = msg
        .replace('%s', serverContent)
        .replace('%s', clientContent)
        .replace('%s', '')
    }

    // @ts-expect-error argument is defined
    prev.apply(console, arguments)
  }
}
