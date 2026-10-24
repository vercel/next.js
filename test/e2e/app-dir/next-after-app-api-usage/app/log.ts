// Emit all outcomes from one fixture invocation together. Seeing a separately
// delivered "finished" line would not prove that earlier messages arrived.
export function createLogger(
  requestId: string | undefined,
  expectedMessages: number
) {
  const messages: string[] = []
  return (...parts: unknown[]) => {
    messages.push(parts.map(String).join(' '))
    if (messages.length === expectedMessages) {
      console.log(
        `<after-results>${JSON.stringify({ requestId, messages })}</after-results>`
      )
    }
  }
}
