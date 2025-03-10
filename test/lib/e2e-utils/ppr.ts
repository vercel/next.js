export async function measurePPRTimings(
  fn: () => Promise<NodeJS.ReadableStream>,
  delay: number
) {
  const start = Date.now()

  // Create the stream so we can measure it.
  const stream = await fn()

  let streamFirstChunk = 0
  let streamEnd = 0

  const chunks: {
    chunk: string
    emittedAt: number
  }[] = []

  await new Promise<void>((resolve, reject) => {
    stream.on('data', (chunk: Buffer | string) => {
      if (!streamFirstChunk) {
        streamFirstChunk = Date.now()
      }

      if (typeof chunk !== 'string') {
        chunk = chunk.toString()
      }

      chunks.push({ chunk, emittedAt: Date.now() })
    })

    stream.on('end', () => {
      streamEnd = Date.now()
      resolve()
    })

    stream.on('error', reject)
  })

  return {
    // Find all the chunks that arrived before the delay, and split
    // it into the static and dynamic parts.
    chunks: chunks.reduce<{
      static: string
      dynamic: string
    }>(
      (acc, { chunk, emittedAt }) => {
        if (emittedAt < start + delay) {
          acc.static += chunk
        } else {
          acc.dynamic += chunk
        }
        return acc
      },
      { static: '', dynamic: '' }
    ),
    timings: {
      start,
      streamFirstChunk,
      streamEnd,
    },
  }
}
