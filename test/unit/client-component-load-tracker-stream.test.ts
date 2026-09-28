/* eslint-env jest */
/**
 * @jest-environment node
 */
import { ClientComponentLoadTracker } from 'next/dist/server/client-component-renderer-logger'
import { once } from 'node:events'
import { PassThrough } from 'node:stream'

const encode = (text: string) => new TextEncoder().encode(text)

describe('client component load tracker stream handoff', () => {
  it('finishes an unbound render and waits only for pending loads', async () => {
    let resolveReport!: () => void
    const reported = new Promise<void>((resolve) => {
      resolveReport = resolve
    })
    const report = jest.fn(() => resolveReport())
    const tracker = new ClientComponentLoadTracker(report)
    tracker.beginChunk(100)

    tracker.finishIfNotStreaming()
    await Promise.resolve()
    expect(report).not.toHaveBeenCalled()

    tracker.finishChunk(100, 140)
    await reported
    tracker.finishIfNotStreaming()
    expect(report).toHaveBeenCalledTimes(1)
    expect(report).toHaveBeenCalledWith({
      clientComponentLoadStart: 100,
      clientComponentLoadEnd: 140,
      clientComponentLoadTimes: 40,
      clientComponentLoadCount: 0,
    })
  })

  it('keeps tracking late loads until the bound Web stream ends', async () => {
    let controller!: ReadableStreamDefaultController<Uint8Array>
    const source = new ReadableStream<Uint8Array>({
      start(value) {
        controller = value
      },
    })
    let resolveReport!: () => void
    const reported = new Promise<void>((resolve) => {
      resolveReport = resolve
    })
    const report = jest.fn(() => resolveReport())
    const tracker = new ClientComponentLoadTracker(report)
    const output = tracker.bindToStream(source)
    tracker.finishIfNotStreaming()

    let resolveFirstWrite!: () => void
    const firstWrite = new Promise<void>((resolve) => {
      resolveFirstWrite = resolve
    })
    const chunks: Uint8Array[] = []
    const piped = output.pipeTo(
      new WritableStream<Uint8Array>({
        write(chunk) {
          chunks.push(chunk)
          resolveFirstWrite()
        },
      })
    )
    controller.enqueue(encode('early '))
    await firstWrite
    expect(report).not.toHaveBeenCalled()

    tracker.beginRequire(100)
    tracker.finishRequire(100, 125)
    controller.enqueue(encode('late'))
    controller.close()
    await piped
    await reported

    expect(Buffer.concat(chunks).toString()).toBe('early late')
    expect(report).toHaveBeenCalledTimes(1)
    expect(report).toHaveBeenCalledWith({
      clientComponentLoadStart: 100,
      clientComponentLoadEnd: 125,
      clientComponentLoadTimes: 25,
      clientComponentLoadCount: 1,
    })
  })

  it('finishes on a source error without replacing that error', async () => {
    let controller!: ReadableStreamDefaultController<Uint8Array>
    const source = new ReadableStream<Uint8Array>({
      start(value) {
        controller = value
      },
    })
    let resolveReport!: () => void
    const reported = new Promise<void>((resolve) => {
      resolveReport = resolve
    })
    const report = jest.fn(() => resolveReport())
    const tracker = new ClientComponentLoadTracker(report)
    const output = tracker.bindToStream(source)
    tracker.finishIfNotStreaming()

    const piped = output.pipeTo(new WritableStream<Uint8Array>())
    const error = new Error('render failed')
    controller.error(error)
    await expect(piped).rejects.toBe(error)
    await reported
    expect(report).toHaveBeenCalledTimes(1)
  })

  it('finishes on cancellation and preserves its reason', async () => {
    const onCancel = jest.fn()
    const source = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encode('partial'))
      },
      cancel: onCancel,
    })
    let resolveReport!: () => void
    const reported = new Promise<void>((resolve) => {
      resolveReport = resolve
    })
    const report = jest.fn(() => resolveReport())
    const tracker = new ClientComponentLoadTracker(report)
    const output = tracker.bindToStream(source)
    tracker.finishIfNotStreaming()

    const reader = output.getReader()
    expect((await reader.read()).value).toEqual(encode('partial'))
    const reason = new Error('consumer cancelled')
    await reader.cancel(reason)
    await reported

    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onCancel).toHaveBeenCalledWith(reason)
    expect(report).toHaveBeenCalledTimes(1)
  })

  it('does not hold output open for a pending load', async () => {
    const source = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encode('done'))
        controller.close()
      },
    })
    let resolveReport!: () => void
    const reported = new Promise<void>((resolve) => {
      resolveReport = resolve
    })
    const report = jest.fn(() => resolveReport())
    const tracker = new ClientComponentLoadTracker(report)
    tracker.beginChunk(100)
    const output = tracker.bindToStream(source)
    tracker.finishIfNotStreaming()

    const chunks: Uint8Array[] = []
    await output.pipeTo(
      new WritableStream<Uint8Array>({
        write(chunk) {
          chunks.push(chunk)
        },
      })
    )
    expect(Buffer.concat(chunks).toString()).toBe('done')
    expect(report).not.toHaveBeenCalled()

    tracker.finishChunk(100, 160)
    await reported
    expect(report).toHaveBeenCalledTimes(1)
  })

  it('falls back to immediate finish when a Web stream is already locked', async () => {
    const source = new ReadableStream<Uint8Array>()
    const reader = source.getReader()
    let resolveReport!: () => void
    const reported = new Promise<void>((resolve) => {
      resolveReport = resolve
    })
    const report = jest.fn(() => resolveReport())
    const tracker = new ClientComponentLoadTracker(report)

    expect(tracker.bindToStream(source)).toBe(source)
    tracker.finishIfNotStreaming()
    await reported
    expect(report).toHaveBeenCalledTimes(1)
    reader.releaseLock()
  })

  it('observes Node readable EOF after its bytes are consumed', async () => {
    const { trackStreamCompletion } = await import(
      'next/dist/server/stream-utils/track-stream-completion.node'
    )
    const source = new PassThrough()
    const onSettled = jest.fn()
    const output = trackStreamCompletion(source, onSettled)
    const chunks: Buffer[] = []
    let resolveFirstChunk!: () => void
    const firstChunk = new Promise<void>((resolve) => {
      resolveFirstChunk = resolve
    })
    output.on('data', (chunk: Buffer) => {
      chunks.push(chunk)
      resolveFirstChunk()
    })
    source.write('first ')
    await firstChunk
    expect(onSettled).not.toHaveBeenCalled()

    const ended = once(output, 'end')
    source.end('last')
    await ended
    expect(Buffer.concat(chunks).toString()).toBe('first last')
    expect(onSettled).toHaveBeenCalledTimes(1)
    expect(onSettled).toHaveBeenCalledWith(true)
  })

  it('observes Node source error without replacing it', async () => {
    const { trackStreamCompletion } = await import(
      'next/dist/server/stream-utils/track-stream-completion.node'
    )
    const source = new PassThrough()
    const onSettled = jest.fn()
    const output = trackStreamCompletion(source, onSettled)
    const error = new Error('source failed')
    const errored = once(output, 'error')
    const closed = new Promise<void>((resolve) => output.once('close', resolve))

    source.destroy(error)
    expect((await errored)[0]).toBe(error)
    await closed
    expect(onSettled).toHaveBeenCalledTimes(1)
    expect(onSettled).toHaveBeenCalledWith(false)
  })

  it('observes premature Node close without an error', async () => {
    const { trackStreamCompletion } = await import(
      'next/dist/server/stream-utils/track-stream-completion.node'
    )
    const source = new PassThrough()
    const onSettled = jest.fn()
    const output = trackStreamCompletion(source, onSettled)
    const closed = once(output, 'close')

    source.destroy()
    await closed
    expect(onSettled).toHaveBeenCalledTimes(1)
    expect(onSettled).toHaveBeenCalledWith(false)
  })

  it('recognizes a Node readable that ended before observation', async () => {
    const { trackStreamCompletion } = await import(
      'next/dist/server/stream-utils/track-stream-completion.node'
    )
    const source = new PassThrough()
    const ended = once(source, 'end')
    source.resume()
    source.end('done')
    await ended

    let resolveSettled!: (completed: boolean) => void
    const settled = new Promise<boolean>((resolve) => {
      resolveSettled = resolve
    })
    const onSettled = jest.fn(resolveSettled)
    expect(trackStreamCompletion(source, onSettled)).toBe(source)
    expect(await settled).toBe(true)
    expect(onSettled).toHaveBeenCalledTimes(1)
    expect(onSettled).toHaveBeenCalledWith(true)
  })
})
