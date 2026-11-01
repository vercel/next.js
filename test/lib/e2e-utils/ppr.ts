/**
 * Measures and separates static and dynamic content in a response stream
 * by splitting on PPR boundary sentinel markers.
 *
 * This function is used in Partial Prerendering (PPR) tests to analyze the output
 * of Next.js pages and verify that static and dynamic content are properly separated.
 *
 * @param fn - A function that returns a Promise resolving to a readable stream
 *             containing HTML with PPR boundary markers
 * @returns An object containing the separated static and dynamic chunks
 *
 * @example
 * const [staticPart, dynamicPart] = await splitResponseWithPPRSentinel(async () => {
 *   return fetch('/some-ppr-page').then(res => res.body)
 * })
 * console.log(staticPart)  // Content before the boundary
 * console.log(dynamicPart) // Content after the boundary
 */
export async function splitResponseWithPPRSentinel(
  fn: () => Promise<ReadableStream<Uint8Array> | null>
): Promise<[staticPart: string, dynamicPart: string]> {
  const stream = await fn()
  if (stream === null) {
    throw new Error('Expected a response body')
  }
  const chunks: string[] = []

  const decoder = new TextDecoder()
  for await (const chunk of stream) {
    chunks.push(
      typeof chunk === 'string'
        ? chunk
        : decoder.decode(chunk, { stream: true })
    )
  }
  chunks.push(decoder.decode())

  // Combine all chunks and split on the PPR boundary sentinel
  // The sentinel marks the boundary between static and dynamic content
  const parts = chunks.join('').split('<!-- PPR_BOUNDARY_SENTINEL -->', 2)
  return [parts[0] ?? '', parts[1] ?? '']
}
