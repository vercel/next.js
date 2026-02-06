import { ENCODED_TAGS } from './encoded-tags'
import {
  createBufferedTransformStream,
  createHeadInsertionTransformStream,
  createFlightDataInjectionTransformStream,
  createMetadataTransformStream,
  createMoveSuffixStream,
  createUnifiedSSRTransformStream,
} from './node-web-streams-helper'
import { scheduleImmediate } from '../../lib/scheduler'

const encoder = new TextEncoder()
const decoder = new TextDecoder()

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

// Pipe a source ReadableStream through one or more TransformStreams and collect output
async function pipeAndCollect(
  input: ReadableStream<Uint8Array>,
  transforms: TransformStream<Uint8Array, Uint8Array>[]
): Promise<string> {
  let stream: ReadableStream<Uint8Array> = input
  for (const t of transforms) {
    stream = stream.pipeThrough(t)
  }
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
  }
  const total = chunks.reduce((sum, c) => sum + c.byteLength, 0)
  const merged = new Uint8Array(total)
  let offset = 0
  for (const c of chunks) {
    merged.set(c, offset)
    offset += c.byteLength
  }
  return decoder.decode(merged)
}

function streamFromChunks(chunks: string[]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk))
      }
      controller.close()
    },
  })
}

function streamFromUint8Arrays(
  chunks: Uint8Array[]
): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(chunk)
      }
      controller.close()
    },
  })
}

// A minimal deferred suffix stream that matches the original behavior:
// after the first chunk, schedule the suffix to be enqueued on next tick.
function createDeferredSuffixStream(
  suffix: string
): TransformStream<Uint8Array, Uint8Array> {
  let flushed = false
  let pending: Promise<void> | undefined
  let pendingResolve: (() => void) | undefined

  return new TransformStream({
    transform(chunk, controller) {
      controller.enqueue(chunk)
      if (flushed) return
      flushed = true
      pending = new Promise<void>((resolve) => {
        pendingResolve = resolve
      })
      scheduleImmediate(() => {
        try {
          controller.enqueue(encoder.encode(suffix))
        } catch {
          // stream may be errored/cancelled
        } finally {
          const r = pendingResolve!
          pendingResolve = undefined
          pending = undefined
          r()
        }
      })
    },
    flush() {
      if (pending) return pending
      if (flushed) return
      // Never got a chunk, but flush should still emit the suffix
    },
  })
}

// Create a ReadableStream that delivers chunks asynchronously (one per tick).
// This simulates how React delivers chunks in real SSR (not all at once).
function asyncStreamFromChunks(chunks: string[]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    async start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk))
        // Wait a tick so scheduleImmediate callbacks can fire between chunks
        await new Promise((r) => setTimeout(r, 0))
      }
      // Extra tick before close to let any pending scheduleImmediate fire
      await new Promise((r) => setTimeout(r, 10))
      controller.close()
    },
  })
}

// Default stubs
const noopInsertedHTML = () => Promise.resolve('')
const noopInsertedMetadata = () => Promise.resolve('')

// ---------------------------------------------------------------------------
// Build the two implementations under test
// ---------------------------------------------------------------------------

type TestCase = {
  inputChunks: string[] | Uint8Array[]
  getServerInsertedHTML?: () => Promise<string>
  getServerInsertedMetadata?: () => Promise<string> | string
  inlinedDataStream?: ReadableStream<Uint8Array>
  suffix?: string | null
}

// Build the legacy chain of individual transforms (the "before" implementation).
// This mirrors how continueFizzStream composed transforms before the unified version.
function buildLegacyChain(opts: TestCase): {
  input: ReadableStream<Uint8Array>
  transforms: TransformStream<Uint8Array, Uint8Array>[]
} {
  const input =
    opts.inputChunks.length > 0 && opts.inputChunks[0] instanceof Uint8Array
      ? streamFromUint8Arrays(opts.inputChunks as Uint8Array[])
      : streamFromChunks(opts.inputChunks as string[])

  const transforms: TransformStream<Uint8Array, Uint8Array>[] = []

  // 1. Buffered batching
  transforms.push(createBufferedTransformStream())

  // 2. Metadata icon mark handling
  transforms.push(
    createMetadataTransformStream(
      opts.getServerInsertedMetadata ?? noopInsertedMetadata
    )
  )

  // 3. Deferred suffix (if present)
  if (opts.suffix) {
    transforms.push(createDeferredSuffixStream(opts.suffix))
  }

  // 4. Flight data injection
  if (opts.inlinedDataStream) {
    transforms.push(
      createFlightDataInjectionTransformStream(opts.inlinedDataStream, true)
    )
  }

  // 5. Move suffix (</body></html>) to end
  transforms.push(createMoveSuffixStream())

  // 6. Head insertion
  transforms.push(
    createHeadInsertionTransformStream(
      opts.getServerInsertedHTML ?? noopInsertedHTML
    )
  )

  return { input, transforms }
}

// Build the unified transform (the "after" implementation).
function buildUnifiedTransform(opts: TestCase): {
  input: ReadableStream<Uint8Array>
  transforms: TransformStream<Uint8Array, Uint8Array>[]
} {
  const input =
    opts.inputChunks.length > 0 && opts.inputChunks[0] instanceof Uint8Array
      ? streamFromUint8Arrays(opts.inputChunks as Uint8Array[])
      : streamFromChunks(opts.inputChunks as string[])

  return {
    input,
    transforms: [
      createUnifiedSSRTransformStream({
        getServerInsertedHTML: opts.getServerInsertedHTML ?? noopInsertedHTML,
        getServerInsertedMetadata:
          opts.getServerInsertedMetadata ?? noopInsertedMetadata,
        inlinedDataStream: opts.inlinedDataStream,
        suffix: opts.suffix ?? null,
      }),
    ],
  }
}

// Run a test case against both implementations and return both results.
// Each call gets fresh streams (streams are one-shot).
async function runBoth(
  makeOpts: () => TestCase
): Promise<{ legacy: string; unified: string }> {
  const legacyOpts = makeOpts()
  const { input: legacyInput, transforms: legacyTransforms } =
    buildLegacyChain(legacyOpts)
  const legacy = await pipeAndCollect(legacyInput, legacyTransforms)

  const unifiedOpts = makeOpts()
  const { input: unifiedInput, transforms: unifiedTransforms } =
    buildUnifiedTransform(unifiedOpts)
  const unified = await pipeAndCollect(unifiedInput, unifiedTransforms)

  return { legacy, unified }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

// Helper to run assertions against both implementations
function assertBoth(
  results: { legacy: string; unified: string },
  assertions: (result: string, label: string) => void
) {
  assertions(results.legacy, 'legacy')
  assertions(results.unified, 'unified')
}

describe('SSR Transform Streams', () => {
  describe('basic passthrough', () => {
    it('passes through a simple HTML page and adds closing tags', async () => {
      const results = await runBoth(() => ({
        inputChunks: [
          '<html><head></head><body>',
          '<h1>Hello</h1>',
          '</body></html>',
        ],
      }))

      assertBoth(results, (result) => {
        expect(result).toContain('<h1>Hello</h1>')
        expect(result).toContain('</body></html>')
        expect(result.lastIndexOf('</body></html>')).toBe(
          result.length - '</body></html>'.length
        )
      })
    })

    it('handles empty stream', async () => {
      const results = await runBoth(() => ({
        inputChunks: [],
      }))

      assertBoth(results, (result) => {
        // Should still emit the closing tags
        expect(result).toBe('</body></html>')
      })
    })
  })

  describe('suffix stripping and reinsertion', () => {
    it('moves </body></html> to the end when it appears mid-stream', async () => {
      const results = await runBoth(() => ({
        inputChunks: [
          '<html><head></head><body><div>content</div></body></html>',
          '<script>extra()</script>',
        ],
      }))

      assertBoth(results, (result) => {
        expect(result).toContain('<div>content</div>')
        expect(result).toContain('<script>extra()</script>')
        expect(result.endsWith('</body></html>')).toBe(true)
        expect(result.indexOf('<script>extra()</script>')).toBeLessThan(
          result.lastIndexOf('</body></html>')
        )
      })
    })

    it('handles </body></html> as a standalone chunk', async () => {
      const results = await runBoth(() => ({
        inputChunks: ['<html><head></head><body><p>test</p>', '</body></html>'],
      }))

      assertBoth(results, (result) => {
        expect(result).toContain('<p>test</p>')
        expect(result.endsWith('</body></html>')).toBe(true)
      })
    })
  })

  describe('head insertion', () => {
    it('inserts server HTML before </head>', async () => {
      const results = await runBoth(() => {
        let callCount = 0
        return {
          inputChunks: [
            '<html><head><title>Test</title></head><body>',
            '<p>content</p></body></html>',
          ],
          getServerInsertedHTML: () => {
            callCount++
            if (callCount === 1) {
              return Promise.resolve(
                '<link rel="stylesheet" href="/style.css">'
              )
            }
            return Promise.resolve('')
          },
        }
      })

      assertBoth(results, (result) => {
        expect(result).toContain(
          '<link rel="stylesheet" href="/style.css"></head>'
        )
      })
    })

    it('inserts server HTML when no </head> is found (PPR resume)', async () => {
      const results = await runBoth(() => ({
        inputChunks: ['<div>PPR content</div></body></html>'],
        getServerInsertedHTML: () =>
          Promise.resolve('<meta name="robots" content="noindex">'),
      }))

      assertBoth(results, (result) => {
        expect(result).toContain('<meta name="robots" content="noindex">')
        expect(result).toContain('<div>PPR content</div>')
      })
    })
  })

  // Suffix tests use async chunk delivery because the deferred suffix relies on
  // scheduleImmediate timing. With synchronous streams, flush() runs before the
  // scheduleImmediate callback, causing the suffix to be lost.
  describe('deferred suffix', () => {
    it('injects the suffix into the output', async () => {
      const input = asyncStreamFromChunks([
        '<html><head></head><body><p>content</p></body></html>',
      ])

      const transform = createUnifiedSSRTransformStream({
        getServerInsertedHTML: noopInsertedHTML,
        getServerInsertedMetadata: noopInsertedMetadata,
        inlinedDataStream: undefined,
        suffix: '<script>deferred()</script>',
      })

      const result = await pipeAndCollect(input, [transform])

      expect(result).toContain('<script>deferred()</script>')
      expect(result.indexOf('<script>deferred()</script>')).toBeLessThan(
        result.lastIndexOf('</body></html>')
      )
    })
  })

  describe('flight data injection', () => {
    it('includes flight data in the output', async () => {
      const results = await runBoth(() => ({
        inputChunks: ['<html><head></head><body><p>page</p></body></html>'],
        inlinedDataStream: streamFromChunks([
          '<script>self.__next_f=[]</script>',
          '<script>self.__next_f.push([1,"data"])</script>',
        ]),
      }))

      assertBoth(results, (result) => {
        expect(result).toContain('self.__next_f=[]')
        expect(result).toContain('self.__next_f.push([1,"data"])')
        expect(result.endsWith('</body></html>')).toBe(true)
      })
    })

    it('drains flight data in flush when HTML ends quickly', async () => {
      const results = await runBoth(() => ({
        inputChunks: ['<html><head></head><body><p>fast</p></body></html>'],
        inlinedDataStream: new ReadableStream<Uint8Array>({
          async start(controller) {
            await new Promise((r) => setTimeout(r, 50))
            controller.enqueue(encoder.encode('<script>late_flight()</script>'))
            controller.close()
          },
        }),
      }))

      assertBoth(results, (result) => {
        expect(result).toContain('<script>late_flight()</script>')
        expect(result.endsWith('</body></html>')).toBe(true)
      })
    })
  })

  describe('metadata icon mark handling', () => {
    function buildIconMarkChunk(before: string, after: string): Uint8Array {
      const iconMark = ENCODED_TAGS.META.ICON_MARK
      const closingByte = new Uint8Array([62]) // '>'
      const beforeBytes = encoder.encode(before)
      const afterBytes = encoder.encode(after)
      const full = new Uint8Array(
        beforeBytes.length +
          iconMark.length +
          closingByte.length +
          afterBytes.length
      )
      full.set(beforeBytes, 0)
      full.set(iconMark, beforeBytes.length)
      full.set(closingByte, beforeBytes.length + iconMark.length)
      full.set(
        afterBytes,
        beforeBytes.length + iconMark.length + closingByte.length
      )
      return full
    }

    it('removes the icon mark from the first chunk (before </head>)', async () => {
      const results = await runBoth(() => ({
        inputChunks: [
          buildIconMarkChunk(
            '<html><head><title>Test</title>',
            '</head><body>content</body></html>'
          ),
        ],
      }))

      assertBoth(results, (result) => {
        expect(result).not.toContain('\u00ABnxt-icon\u00BB')
        expect(result).toContain('<title>Test</title>')
        expect(result).toContain('content')
      })
    })

    it('replaces icon mark with metadata on a later chunk', async () => {
      const results = await runBoth(() => ({
        inputChunks: [
          encoder.encode(
            '<html><head><title>Test</title></head><body>'
          ) as Uint8Array,
          buildIconMarkChunk('<div>', '</div></body></html>'),
        ],
        getServerInsertedMetadata: () =>
          Promise.resolve('<link rel="icon" href="/favicon.ico">'),
      }))

      assertBoth(results, (result) => {
        expect(result).not.toContain('\u00ABnxt-icon\u00BB')
        expect(result).toContain('<link rel="icon" href="/favicon.ico">')
      })
    })
  })

  // Combined tests with suffix only run against the unified transform
  // (see deferred suffix comment above for rationale).
  describe('combined behavior', () => {
    it('handles head insertion + suffix + flight data together', async () => {
      let callCount = 0
      const input = asyncStreamFromChunks([
        '<html><head><title>App</title></head><body>',
        '<main>content</main>',
        '</body></html>',
      ])

      const transform = createUnifiedSSRTransformStream({
        getServerInsertedHTML: () => {
          callCount++
          if (callCount === 1) {
            return Promise.resolve('<link rel="stylesheet" href="/app.css">')
          }
          return Promise.resolve('')
        },
        getServerInsertedMetadata: noopInsertedMetadata,
        inlinedDataStream: streamFromChunks([
          '<script>self.__next_f=[]</script>',
        ]),
        suffix: '<script>bootstrap()</script>',
      })

      const result = await pipeAndCollect(input, [transform])

      // Head insertion present
      expect(result).toContain('<link rel="stylesheet" href="/app.css"></head>')
      // Main content present
      expect(result).toContain('<main>content</main>')
      // Suffix before closing tags
      const suffixIdx = result.indexOf('<script>bootstrap()</script>')
      const closeIdx = result.lastIndexOf('</body></html>')
      expect(suffixIdx).toBeGreaterThan(-1)
      expect(suffixIdx).toBeLessThan(closeIdx)
      // Flight data present
      expect(result).toContain('self.__next_f=[]')
      // Closing tags at the end
      expect(result.endsWith('</body></html>')).toBe(true)
    })

    it('closing tags appear exactly once', async () => {
      const input = asyncStreamFromChunks([
        '<html><head></head><body><p>hi</p></body></html>',
      ])

      const transform = createUnifiedSSRTransformStream({
        getServerInsertedHTML: noopInsertedHTML,
        getServerInsertedMetadata: noopInsertedMetadata,
        inlinedDataStream: streamFromChunks(['<script>rsc()</script>']),
        suffix: '<script>suffix()</script>',
      })

      const result = await pipeAndCollect(input, [transform])

      expect(result).toContain('<p>hi</p>')
      expect(result.endsWith('</body></html>')).toBe(true)
      const firstClose = result.indexOf('</body></html>')
      const lastClose = result.lastIndexOf('</body></html>')
      expect(firstClose).toBe(lastClose)
    })

    it('head insertion + flight data (no suffix) matches legacy', async () => {
      const results = await runBoth(() => {
        let callCount = 0
        return {
          inputChunks: [
            '<html><head><title>App</title></head><body>',
            '<main>content</main>',
            '</body></html>',
          ],
          getServerInsertedHTML: () => {
            callCount++
            if (callCount === 1) {
              return Promise.resolve('<link rel="stylesheet" href="/app.css">')
            }
            return Promise.resolve('')
          },
          inlinedDataStream: streamFromChunks([
            '<script>self.__next_f=[]</script>',
          ]),
        }
      })

      assertBoth(results, (result) => {
        expect(result).toContain(
          '<link rel="stylesheet" href="/app.css"></head>'
        )
        expect(result).toContain('<main>content</main>')
        expect(result).toContain('self.__next_f=[]')
        expect(result.endsWith('</body></html>')).toBe(true)
      })
    })
  })

  // Tests specific to the unified transform (error propagation fix)
  describe('unified transform: error propagation', () => {
    it('propagates errors from getServerInsertedHTML during flush', async () => {
      // getServerInsertedHTML is called in flush() directly via
      // await applyHeadInsertion() and await getServerInsertedHTML().
      // Errors from these direct awaits propagate through the stream.
      const input = asyncStreamFromChunks([
        '<html><head></head><body><p>content</p></body></html>',
      ])

      const transform = createUnifiedSSRTransformStream({
        getServerInsertedHTML: () =>
          Promise.reject(new Error('insertion failed')),
        getServerInsertedMetadata: noopInsertedMetadata,
        inlinedDataStream: undefined,
        suffix: null,
      })

      await expect(async () => {
        await pipeAndCollect(input, [transform])
      }).rejects.toThrow('insertion failed')
    })

    it('propagates errors from getServerInsertedHTML during scheduleFlush', async () => {
      // This specifically tests the scheduleFlush rejection handler path.
      // getServerInsertedHTML fails exactly once (during a scheduleFlush
      // applyHeadInsertion call), then succeeds for subsequent calls.
      // If the error is swallowed in scheduleFlush, it won't propagate.
      let callCount = 0
      const input = asyncStreamFromChunks([
        '<html><head></head><body>',
        '<p>chunk1</p>',
        '<p>chunk2</p></body></html>',
      ])

      const transform = createUnifiedSSRTransformStream({
        getServerInsertedHTML: () => {
          callCount++
          // Fail only on the second call (during scheduleFlush, after head
          // is already inserted). Succeed on all other calls.
          if (callCount === 2) {
            return Promise.reject(new Error('scheduleFlush error'))
          }
          return Promise.resolve('')
        },
        getServerInsertedMetadata: noopInsertedMetadata,
        inlinedDataStream: undefined,
        suffix: null,
      })

      await expect(async () => {
        await pipeAndCollect(input, [transform])
      }).rejects.toThrow('scheduleFlush error')
    })
  })
})
