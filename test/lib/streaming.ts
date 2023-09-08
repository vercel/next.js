const textDecoder = new TextDecoder('utf-8')

/** Helper function that resolves a {@link Response} {@link ReadableStream} into a string. */
export async function resolveStreamResponse(
  response: Response,
  onData: (val: string, result: string) => void = () => {}
): Promise<string> {
  let result = ''
  if (!response.body) return result

  const reader = response.body.getReader()

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      const text = textDecoder.decode(value)
      result += text
      onData(text, result)
    }
  } finally {
    reader.releaseLock()
  }
  return result
}
