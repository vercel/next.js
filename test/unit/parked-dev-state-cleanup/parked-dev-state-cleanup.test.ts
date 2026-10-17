import { PassThrough } from 'stream'
import {
  PARKED_ENTRY_TIMEOUT_MS,
  ParkedEntries,
  releaseParkedStream,
} from 'next/dist/server/dev/parked-entries'
import {
  connectReactDebugChannelForHtmlRequest,
  deleteReactDebugChannelForHtmlRequest,
  setReactDebugChannelForHtmlRequest,
} from 'next/dist/server/dev/debug-channel'
import {
  deleteErrorsRscStreamForHtmlRequest,
  sendSerializedErrorsToClientForHtmlRequest,
  setErrorsRscStreamForHtmlRequest,
} from 'next/dist/server/dev/serialized-errors'
import { ReplayableNodeStream } from 'next/dist/server/app-render/app-render-prerender-utils'
import { createNodeDebugChannel } from 'next/dist/server/app-render/debug-channel-server.node'
import { createWebDebugChannel } from 'next/dist/server/app-render/debug-channel-server.web'
import {
  HMR_MESSAGE_SENT_TO_BROWSER,
  type HmrMessageSentToBrowser,
} from 'next/dist/server/dev/hot-reloader-types'

let nextId = 0
const uniqueId = () => `html-request-${++nextId}`

async function flushMicrotasks() {
  for (let i = 0; i < 10; i++) {
    await Promise.resolve()
  }
}

describe('parked dev state cleanup', () => {
  beforeEach(() => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] })
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  describe('ParkedEntries', () => {
    it('evicts an unclaimed entry after the timeout', () => {
      const onEvict = jest.fn()
      const entries = new ParkedEntries<string>(onEvict)

      entries.set('a', 'value')
      jest.advanceTimersByTime(PARKED_ENTRY_TIMEOUT_MS - 1)
      expect(entries.size).toBe(1)
      expect(onEvict).not.toHaveBeenCalled()

      jest.advanceTimersByTime(1)
      expect(entries.size).toBe(0)
      expect(entries.take('a')).toBeUndefined()
      expect(onEvict).toHaveBeenCalledTimes(1)
      expect(onEvict).toHaveBeenCalledWith('value')
    })

    it('uses a 30 second timeout', () => {
      expect(PARKED_ENTRY_TIMEOUT_MS).toBe(30_000)
    })

    it('does not evict or release a claimed entry', () => {
      const onEvict = jest.fn()
      const entries = new ParkedEntries<string>(onEvict)

      entries.set('a', 'value')
      expect(entries.take('a')).toBe('value')
      expect(jest.getTimerCount()).toBe(0)

      jest.advanceTimersByTime(PARKED_ENTRY_TIMEOUT_MS * 2)
      expect(onEvict).not.toHaveBeenCalled()
    })

    it('does not let a stale timer evict an entry that was re-parked after deletion', () => {
      const onEvict = jest.fn()
      const entries = new ParkedEntries<string>(onEvict)

      entries.set('a', 'first')
      jest.advanceTimersByTime(10_000)
      entries.delete('a')
      entries.set('a', 'second')

      // The first entry's timeout would fire now.
      jest.advanceTimersByTime(PARKED_ENTRY_TIMEOUT_MS - 10_000)
      expect(entries.size).toBe(1)
      expect(onEvict).not.toHaveBeenCalled()

      jest.advanceTimersByTime(10_000)
      expect(entries.size).toBe(0)
      expect(onEvict).toHaveBeenCalledTimes(1)
      expect(onEvict).toHaveBeenCalledWith('second')
    })

    it('does not let a stale timer evict or release an entry that was re-parked', () => {
      const onEvict = jest.fn()
      const entries = new ParkedEntries<string>(onEvict)

      entries.set('a', 'first')
      jest.advanceTimersByTime(10_000)
      entries.set('a', 'second')
      expect(jest.getTimerCount()).toBe(1)

      jest.advanceTimersByTime(PARKED_ENTRY_TIMEOUT_MS - 10_000)
      expect(entries.take('a')).toBe('second')

      jest.advanceTimersByTime(PARKED_ENTRY_TIMEOUT_MS)
      expect(onEvict).not.toHaveBeenCalled()
    })

    it('evicts plain values (e.g. cache statuses) without a release callback', () => {
      const entries = new ParkedEntries<'ready' | 'bypass'>()

      entries.set('a', 'ready')
      entries.set('b', 'bypass')
      jest.advanceTimersByTime(5_000)
      entries.set('b', 'ready')

      jest.advanceTimersByTime(PARKED_ENTRY_TIMEOUT_MS - 5_000)
      expect(entries.take('a')).toBeUndefined()
      expect(entries.take('b')).toBe('ready')
    })

    it('does not throw when releasing an evicted entry fails', () => {
      const entries = new ParkedEntries<string>(() => {
        throw new Error('release failed')
      })

      entries.set('a', 'value')
      expect(() =>
        jest.advanceTimersByTime(PARKED_ENTRY_TIMEOUT_MS)
      ).not.toThrow()
      expect(entries.size).toBe(0)
    })

    it('does not keep the process alive', () => {
      const setTimeoutSpy = jest.spyOn(global, 'setTimeout')
      const entries = new ParkedEntries<string>()

      entries.set('a', 'value')

      const timer = setTimeoutSpy.mock.results[0].value as NodeJS.Timeout
      expect(timer.hasRef()).toBe(false)
      setTimeoutSpy.mockRestore()
    })
  })

  describe('releaseParkedStream', () => {
    it('destroys a Node.js readable', () => {
      const readable = new PassThrough()
      readable.write('chunk')

      releaseParkedStream(readable)
      expect(readable.destroyed).toBe(true)
    })

    it('cancels a web readable', async () => {
      const cancel = jest.fn()
      const readable = new ReadableStream({ cancel })

      releaseParkedStream(readable)
      await flushMicrotasks()
      expect(cancel).toHaveBeenCalledTimes(1)
    })

    it('swallows a rejected cancellation', async () => {
      const onUnhandledRejection = jest.fn()
      process.on('unhandledRejection', onUnhandledRejection)

      try {
        const readable = new ReadableStream()
        // A locked stream rejects `cancel()`.
        readable.getReader()

        expect(() => releaseParkedStream(readable)).not.toThrow()
        await new Promise((resolve) => setImmediate(resolve))
        await new Promise((resolve) => setImmediate(resolve))
        expect(onUnhandledRejection).not.toHaveBeenCalled()
      } finally {
        process.off('unhandledRejection', onUnhandledRejection)
      }
    })
  })

  describe('React debug channels', () => {
    it('releases an unclaimed debug channel after the timeout', () => {
      const htmlRequestId = uniqueId()
      const readable = new PassThrough()
      readable.write('debug chunk')

      setReactDebugChannelForHtmlRequest(htmlRequestId, { readable })
      jest.advanceTimersByTime(PARKED_ENTRY_TIMEOUT_MS - 1)
      expect(readable.destroyed).toBe(false)

      jest.advanceTimersByTime(1)
      expect(readable.destroyed).toBe(true)

      // A client that connects after the eviction doesn't get anything.
      const sendToClient = jest.fn()
      connectReactDebugChannelForHtmlRequest(htmlRequestId, sendToClient)
      expect(sendToClient).not.toHaveBeenCalled()
    })

    it('releases an unclaimed web debug channel after the timeout', async () => {
      const htmlRequestId = uniqueId()
      const cancel = jest.fn()
      const readable = new ReadableStream<Uint8Array>({ cancel })

      setReactDebugChannelForHtmlRequest(htmlRequestId, { readable })
      jest.advanceTimersByTime(PARKED_ENTRY_TIMEOUT_MS)
      await flushMicrotasks()
      expect(cancel).toHaveBeenCalledTimes(1)
    })

    it('delivers a debug channel that is claimed in time and does not release it later', async () => {
      const htmlRequestId = uniqueId()
      const readable = new PassThrough()

      setReactDebugChannelForHtmlRequest(htmlRequestId, { readable })
      jest.advanceTimersByTime(PARKED_ENTRY_TIMEOUT_MS - 1)

      const messages: unknown[] = []
      const done = new Promise<void>((resolve) => {
        connectReactDebugChannelForHtmlRequest(htmlRequestId, (message) => {
          messages.push(message)
          if ('chunk' in message && message.chunk === null) {
            resolve()
          }
        })
      })

      jest.advanceTimersByTime(PARKED_ENTRY_TIMEOUT_MS)
      expect(readable.destroyed).toBe(false)

      readable.end('debug chunk')
      await done

      expect(messages).toEqual([
        {
          type: HMR_MESSAGE_SENT_TO_BROWSER.REACT_DEBUG_CHUNK,
          requestId: htmlRequestId,
          chunk: expect.any(Uint8Array),
        },
        {
          type: HMR_MESSAGE_SENT_TO_BROWSER.REACT_DEBUG_CHUNK,
          requestId: htmlRequestId,
          chunk: null,
        },
      ])
    })

    it('only releases the parked replay, not other consumers of the same source', async () => {
      const htmlRequestId = uniqueId()
      const { serverSide, clientSide } = createNodeDebugChannel()
      const replayable = new ReplayableNodeStream(clientSide.readable)
      const parked = replayable.createReplayStream()
      const other = replayable.createReplayStream()

      const received: string[] = []
      other.on('data', (chunk: Uint8Array) =>
        received.push(Buffer.from(chunk).toString())
      )
      const otherEnded = new Promise<void>((resolve) =>
        other.on('end', resolve)
      )

      serverSide.write('before')
      setReactDebugChannelForHtmlRequest(htmlRequestId, { readable: parked })
      jest.advanceTimersByTime(PARKED_ENTRY_TIMEOUT_MS)
      expect(parked.destroyed).toBe(true)
      expect(clientSide.readable.destroyed).toBe(false)

      serverSide.write('after')
      serverSide.end()
      await otherEnded

      expect(received.join('')).toBe('beforeafter')
      expect(other.destroyed || other.readableEnded).toBe(true)
    })

    it('does not let a stale timer release a debug channel that was re-parked after deletion', () => {
      const htmlRequestId = uniqueId()
      const first = new PassThrough()
      const second = new PassThrough()

      setReactDebugChannelForHtmlRequest(htmlRequestId, { readable: first })
      jest.advanceTimersByTime(10_000)
      deleteReactDebugChannelForHtmlRequest(htmlRequestId)
      setReactDebugChannelForHtmlRequest(htmlRequestId, { readable: second })

      jest.advanceTimersByTime(PARKED_ENTRY_TIMEOUT_MS - 10_000)
      expect(first.destroyed).toBe(false)
      expect(second.destroyed).toBe(false)

      jest.advanceTimersByTime(10_000)
      expect(first.destroyed).toBe(false)
      expect(second.destroyed).toBe(true)
    })

    it('does not let a stale timer release a debug channel that was re-parked', () => {
      const htmlRequestId = uniqueId()
      const first = new PassThrough()
      const second = new PassThrough()

      setReactDebugChannelForHtmlRequest(htmlRequestId, { readable: first })
      jest.advanceTimersByTime(10_000)
      setReactDebugChannelForHtmlRequest(htmlRequestId, { readable: second })

      jest.advanceTimersByTime(PARKED_ENTRY_TIMEOUT_MS - 10_000)
      expect(second.destroyed).toBe(false)

      const sendToClient = jest.fn()
      connectReactDebugChannelForHtmlRequest(htmlRequestId, sendToClient)
      jest.advanceTimersByTime(PARKED_ENTRY_TIMEOUT_MS)
      expect(first.destroyed).toBe(false)
      expect(second.destroyed).toBe(false)
    })
  })

  describe('debug channel producers', () => {
    it('keeps accepting writes from React after the Node.js client side was released', async () => {
      const { serverSide, clientSide } = createNodeDebugChannel()
      const onError = jest.fn()
      serverSide.on('error', onError)

      serverSide.write('before')
      releaseParkedStream(clientSide.readable)

      const writeErrors: unknown[] = []
      serverSide.write('after', (err) => writeErrors.push(err))
      await new Promise<void>((resolve) => serverSide.end(resolve))
      await new Promise((resolve) => setImmediate(resolve))

      expect(writeErrors).toEqual([null])
      expect(onError).not.toHaveBeenCalled()
    })

    it('keeps accepting writes from React when the Node.js client side is released with pending writes', async () => {
      const { serverSide, clientSide } = createNodeDebugChannel()
      const onError = jest.fn()
      serverSide.on('error', onError)

      // Exceed the high water mark so that writes are pending, waiting for a
      // reader that never comes.
      const big = Buffer.alloc(64 * 1024)
      serverSide.write(big)
      serverSide.write(big)
      releaseParkedStream(clientSide.readable)
      serverSide.write(big)
      // All writes settle, so that ending the server side completes.
      await new Promise<void>((resolve) => serverSide.end(resolve))
      await new Promise((resolve) => setImmediate(resolve))

      expect(onError).not.toHaveBeenCalled()
    })

    it('keeps accepting writes from React after the web client side was released', async () => {
      const { serverSide, clientSide } = createWebDebugChannel()
      const writer = (
        serverSide.writable as WritableStream<Uint8Array>
      ).getWriter()

      await writer.write(new Uint8Array([1]))
      releaseParkedStream(clientSide.readable)
      await flushMicrotasks()

      await expect(writer.write(new Uint8Array([2]))).resolves.toBeUndefined()
      await expect(writer.close()).resolves.toBeUndefined()
    })
  })

  describe('serialized errors', () => {
    it('releases an unclaimed errors stream after the timeout', () => {
      const htmlRequestId = uniqueId()
      const errorsRscStream = new PassThrough()

      setErrorsRscStreamForHtmlRequest(htmlRequestId, errorsRscStream)
      jest.advanceTimersByTime(PARKED_ENTRY_TIMEOUT_MS - 1)
      expect(errorsRscStream.destroyed).toBe(false)

      jest.advanceTimersByTime(1)
      expect(errorsRscStream.destroyed).toBe(true)

      const sendToClient = jest.fn()
      sendSerializedErrorsToClientForHtmlRequest(htmlRequestId, sendToClient)
      expect(sendToClient).not.toHaveBeenCalled()
    })

    it('delivers an errors stream that is claimed in time and does not release it later', async () => {
      const htmlRequestId = uniqueId()
      const errorsRscStream = new PassThrough()

      setErrorsRscStreamForHtmlRequest(htmlRequestId, errorsRscStream)

      const message = new Promise<HmrMessageSentToBrowser>((resolve) => {
        sendSerializedErrorsToClientForHtmlRequest(htmlRequestId, resolve)
      })

      jest.advanceTimersByTime(PARKED_ENTRY_TIMEOUT_MS)
      expect(errorsRscStream.destroyed).toBe(false)

      errorsRscStream.end('errors')

      const received = await message
      expect(received.type).toBe(
        HMR_MESSAGE_SENT_TO_BROWSER.ERRORS_TO_SHOW_IN_BROWSER
      )
      expect(
        'serializedErrors' in received &&
          Buffer.from(received.serializedErrors).toString()
      ).toBe('errors')
    })

    it('does not let a stale timer release an errors stream that was re-parked after deletion', () => {
      const htmlRequestId = uniqueId()
      const first = new PassThrough()
      const second = new PassThrough()

      setErrorsRscStreamForHtmlRequest(htmlRequestId, first)
      jest.advanceTimersByTime(10_000)
      deleteErrorsRscStreamForHtmlRequest(htmlRequestId)
      setErrorsRscStreamForHtmlRequest(htmlRequestId, second)

      jest.advanceTimersByTime(PARKED_ENTRY_TIMEOUT_MS - 10_000)
      expect(first.destroyed).toBe(false)
      expect(second.destroyed).toBe(false)

      jest.advanceTimersByTime(10_000)
      expect(first.destroyed).toBe(false)
      expect(second.destroyed).toBe(true)
    })

    it('does not let a stale timer release an errors stream that was re-parked', () => {
      const htmlRequestId = uniqueId()
      const first = new PassThrough()
      const second = new PassThrough()

      setErrorsRscStreamForHtmlRequest(htmlRequestId, first)
      jest.advanceTimersByTime(10_000)
      setErrorsRscStreamForHtmlRequest(htmlRequestId, second)

      jest.advanceTimersByTime(PARKED_ENTRY_TIMEOUT_MS - 10_000)
      expect(first.destroyed).toBe(false)
      expect(second.destroyed).toBe(false)

      jest.advanceTimersByTime(10_000)
      expect(second.destroyed).toBe(true)
    })
  })
})
