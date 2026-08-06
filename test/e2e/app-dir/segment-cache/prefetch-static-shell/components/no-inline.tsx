'use cache'

import { gzipSync } from 'zlib'
import { randomBytes } from 'crypto'

// Default size is 2 KB, the threshold used by Next to decide whether to inline
// a segment into the route tree prefetch.
export async function NoInline({ size = 2048 }: { size?: number }) {
  let content = ''
  let compressedLength = 0
  let iterations = 0
  while (compressedLength < size) {
    const chunk =
      iterations % 2 === 0
        ? '**Arbitrary hidden content to prevent this component from being inlined** '
        : randomBytes(128).toString('base64') + ' '
    content += chunk
    compressedLength = gzipSync(content).length
    iterations++
    if (iterations > 10000) break
  }
  return <div style={{ display: 'none' }}>{content}</div>
}
