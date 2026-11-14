/**
 * @jest-environment node
 */
import { PassThrough, Readable } from 'node:stream'
import React from 'react'
import { prerenderToNodeStream } from 'react-dom/static'
import {
  renderToNodeFizzStream,
  resumeToFizzStream,
  continueDynamicHTMLResumeNode,
  continueFizzStream,
} from 'next/dist/server/app-render/stream-ops.node'

// Exercise the actual transform graph, including its independently-read Flight
// stream. A fatal renderer error is injected at its public stream boundary.
const modes = ['fresh', 'resume', 'resume-delayed'] as const

async function nextTasks() {
  // Flush scheduled React tasks and Node stream lifecycle events without making
  // a test that fails by waiting for the global Jest timeout.
  for (let i = 0; i < 10; i++) {
    await new Promise<void>((resolve) => setImmediate(resolve))
  }
}

describe('Node HTML stream lifecycle', () => {
  let streams: Readable[]

  beforeEach(() => {
    streams = []
  })

  afterEach(async () => {
    for (const stream of streams) stream.destroy()
    await nextTasks()
  })

  function observe<T extends Readable>(stream: T): T {
    streams.push(stream)
    // Observe failures even when they precede the eventual HTML consumer.
    stream.on('error', () => {})
    return stream
  }

  async function createOutput(
    mode: (typeof modes)[number],
    html: Readable,
    flight: Readable,
    overrides: {
      getServerInsertedHTML?: () => Promise<string>
      getServerInsertedMetadata?: () => Promise<string>
    } = {}
  ) {
    const options = {
      inlinedDataStream: flight,
      getServerInsertedHTML: async () => '',
      getServerInsertedMetadata: async () => '',
      deploymentId: undefined,
      ...overrides,
    }
    const output =
      mode === 'fresh'
        ? await continueFizzStream(html, {
            ...options,
            waitForAllReady: false,
          })
        : await continueDynamicHTMLResumeNode(html, {
            ...options,
            delayDataUntilFirstHtmlChunk: mode === 'resume-delayed',
          })
    return observe(output as Readable)
  }

  describe.each(modes)('%s', (mode) => {
    it('propagates a fatal render error and cancels Flight', async () => {
      const html = observe(new PassThrough())
      const flight = observe(new PassThrough())
      const output = await createOutput(mode, html, flight)
      output.resume()
      html.write('<html><head></head><body>shell')
      await nextTasks()

      const failure = new Error('fatal HTML render failure')
      html.destroy(failure)
      await nextTasks()

      expect(output.errored).toBe(failure)
      expect(output.destroyed).toBe(true)
      expect(flight.destroyed).toBe(true)
    })

    it.each(['getServerInsertedHTML', 'getServerInsertedMetadata'] as const)(
      'propagates %s errors back to both input streams',
      async (stage) => {
        const html = observe(new PassThrough())
        const flight = observe(new PassThrough())
        const failure = new Error(`${stage} failure`)
        const insert = jest.fn(async () => {
          throw failure
        })
        const output = await createOutput(mode, html, flight, {
          [stage]: insert,
        })
        output.resume()
        html.write('<html><head></head><body><meta name="«nxt-icon»"/>shell')
        await nextTasks()

        expect(insert).toHaveBeenCalled()
        expect(output.errored).toBe(failure)
        expect(html.destroyed).toBe(true)
        expect(flight.destroyed).toBe(true)
      }
    )

    it('propagates Flight errors and cancels the HTML render', async () => {
      const html = observe(new PassThrough())
      const flight = observe(new PassThrough())
      const output = await createOutput(mode, html, flight)
      output.resume()
      html.write('<html><head></head><body>shell')
      await nextTasks()
      const failure = new Error('inlined Flight failure')
      flight.destroy(failure)
      await nextTasks()

      expect(output.errored).toBe(failure)
      expect(html.destroyed).toBe(true)
    })

    it('cancels both inputs when the output is destroyed', async () => {
      const html = observe(new PassThrough())
      const flight = observe(new PassThrough())
      const output = await createOutput(mode, html, flight)
      output.destroy()
      await nextTasks()

      expect(html.destroyed).toBe(true)
      expect(flight.destroyed).toBe(true)
    })

    it('propagates a Flight failure before the first HTML chunk', async () => {
      const html = observe(new PassThrough())
      const flight = observe(new PassThrough())
      const output = await createOutput(mode, html, flight)
      const failure = new Error('early Flight failure')
      flight.destroy(failure)
      await nextTasks()

      expect(output.errored).toBe(failure)
      expect(html.destroyed).toBe(true)
    })

    it.each(['error', 'close'] as const)(
      'terminates when the HTML source already reached %s',
      async (terminal) => {
        const html = observe(new PassThrough())
        const flight = observe(new PassThrough())
        const failure = new Error('early HTML failure')
        html.destroy(terminal === 'error' ? failure : undefined)
        await nextTasks()
        const output = await createOutput(mode, html, flight)
        await nextTasks()

        expect(output.destroyed).toBe(true)
        expect(output.errored).toBeTruthy()
        if (terminal === 'error') expect(output.errored).toBe(failure)
        expect(flight.destroyed).toBe(true)
      }
    )

    it('ends with empty HTML and Flight streams', async () => {
      const output = await createOutput(
        mode,
        observe(Readable.from([])),
        observe(Readable.from([]))
      )
      const chunks: Buffer[] = []
      output.on('data', (chunk) => chunks.push(Buffer.from(chunk)))
      await nextTasks()

      expect(output.errored).toBeNull()
      expect(output.readableEnded).toBe(true)
      expect(Buffer.concat(chunks).toString()).toBe('</body></html>')
    })

    it('ends healthy HTML and Flight with closing tags last', async () => {
      const html = observe(new PassThrough())
      const flight = observe(new PassThrough())
      const output = await createOutput(mode, html, flight)
      const chunks: Buffer[] = []
      output.on('data', (chunk) => chunks.push(Buffer.from(chunk)))
      html.end('<html><head></head><body>shell</body></html>')
      await nextTasks()
      flight.end('<script>flight</script>')
      await nextTasks()

      expect(output.errored).toBeNull()
      expect(output.readableEnded).toBe(true)
      expect(Buffer.concat(chunks).toString()).toBe(
        '<html><head></head><body>shell<script>flight</script></body></html>'
      )
    })
  })

  it('rejects a fresh shell failure without an unhandled allReady rejection', async () => {
    const failure = new Error('shell failure')
    function BrokenShell(): React.ReactNode {
      throw failure
    }
    await expect(
      renderToNodeFizzStream(React.createElement(BrokenShell), { onError() {} })
    ).rejects.toBe(failure)
    await nextTasks()
  })

  it('preserves deferred piping until all content is ready', async () => {
    let ready = false
    let resolve: () => void
    const pending = new Promise<void>((r) => {
      resolve = r
    })
    function Dynamic(): React.ReactNode {
      if (!ready) throw pending
      return 'ready content'
    }
    const result = await renderToNodeFizzStream(
      React.createElement(
        React.Suspense,
        { fallback: 'loading fallback' },
        React.createElement(Dynamic)
      ),
      {},
      { waitForAllReady: true }
    )
    const stream = observe(result.stream as Readable)
    let text = ''
    stream.on('data', (chunk) => (text += chunk.toString()))
    await nextTasks()
    expect(text).toBe('')
    ready = true
    resolve!()
    await result.allReady
    await nextTasks()
    expect(text).toContain('ready content')
    expect(text).not.toContain('loading fallback')
    expect(stream.readableEnded).toBe(true)
  })

  describe.each(['fresh', 'resume'] as const)('%s Fizz renderer', (mode) => {
    async function startRenderer(onError: (error: unknown) => void) {
      let ready = false
      let resolve: () => void
      const pending = new Promise<void>((r) => {
        resolve = r
      })
      function Dynamic(): React.ReactNode {
        if (!ready) throw pending
        throw new Error('boundary failure')
      }
      const element = React.createElement(
        React.Suspense,
        { fallback: 'loading' },
        React.createElement(Dynamic)
      )
      let result: Awaited<ReturnType<typeof renderToNodeFizzStream>>
      if (mode === 'fresh') {
        result = await renderToNodeFizzStream(element, { onError })
      } else {
        const controller = new AbortController()
        const prerendered = prerenderToNodeStream(element, {
          signal: controller.signal,
          onError() {},
        })
        setImmediate(() => controller.abort())
        const { prelude, postponed } = await prerendered
        expect(postponed).not.toBeNull()
        prelude.resume()
        result = await resumeToFizzStream(element, postponed!, { onError })
      }
      observe(result.stream as Readable).resume()
      return {
        ...result,
        failBoundary() {
          ready = true
          resolve!()
        },
      }
    }

    it('rejects allReady when Fizz fatally fails after the shell', async () => {
      const failure = new Error('fatal error callback failure')
      let firstError = true
      const result = await startRenderer(() => {
        // Escalate one boundary failure into Fizz's fatal path. Its subsequent
        // reporting of that fatal error must not throw a second time.
        if (firstError) {
          firstError = false
          throw failure
        }
      })
      let terminal: unknown = 'pending'
      result.allReady.then(
        () => (terminal = 'resolved'),
        (error) => (terminal = error)
      )
      result.failBoundary()
      await nextTasks()

      expect((result.stream as Readable).errored).toBe(failure)
      expect(terminal).toBe(failure)
    })

    it('aborts pending renderer work on destination cancellation', async () => {
      const onError = jest.fn()
      const result = await startRenderer(onError)
      let terminal: unknown = 'pending'
      result.allReady.then(
        () => (terminal = 'resolved'),
        (error) => (terminal = error)
      )
      ;(result.stream as Readable).destroy()
      await nextTasks()

      expect(terminal).toBeInstanceOf(Error)
      expect(onError).toHaveBeenCalled()
    })
  })
})
