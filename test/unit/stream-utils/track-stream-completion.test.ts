/**
 * @jest-environment node
 */
import { once } from 'node:events'
import { PassThrough } from 'node:stream'
import { trackStreamCompletion as trackNodeStreamCompletion } from 'next/dist/server/stream-utils/track-stream-completion.node'
import { trackStreamCompletion as trackWebStreamCompletion } from 'next/dist/server/stream-utils/track-stream-completion'

function observeSettlement() {
  let resolve!: (completed: boolean) => void
  const settled = new Promise<boolean>((done) => {
    resolve = done
  })
  const onSettled = jest.fn((completed: boolean) => resolve(completed))
  return { onSettled, settled }
}

describe('trackStreamCompletion', () => {
  describe('Web streams', () => {
    it('reports success only after the readable stream ends', async () => {
      let controller!: ReadableStreamDefaultController<Uint8Array>
      const source = new ReadableStream<Uint8Array>({
        start(value) {
          controller = value
        },
      })
      const { onSettled, settled } = observeSettlement()
      const reader = trackWebStreamCompletion(source, onSettled).getReader()

      controller.enqueue(new TextEncoder().encode('first'))
      expect(new TextDecoder().decode((await reader.read()).value)).toBe(
        'first'
      )
      expect(onSettled).not.toHaveBeenCalled()

      controller.close()
      expect(await reader.read()).toEqual({ done: true, value: undefined })
      expect(await settled).toBe(true)
      expect(onSettled).toHaveBeenCalledTimes(1)
    })

    it('preserves a source error and reports failure', async () => {
      let controller!: ReadableStreamDefaultController<Uint8Array>
      const source = new ReadableStream<Uint8Array>({
        start(value) {
          controller = value
        },
      })
      const { onSettled, settled } = observeSettlement()
      const reader = trackWebStreamCompletion(source, onSettled).getReader()
      const error = new Error('source failed')

      controller.error(error)
      await expect(reader.read()).rejects.toBe(error)
      expect(await settled).toBe(false)
      expect(onSettled).toHaveBeenCalledTimes(1)
    })

    it('forwards cancellation and reports failure', async () => {
      const onCancel = jest.fn()
      const source = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('partial'))
        },
        cancel: onCancel,
      })
      const { onSettled, settled } = observeSettlement()
      const reader = trackWebStreamCompletion(source, onSettled).getReader()
      expect(new TextDecoder().decode((await reader.read()).value)).toBe(
        'partial'
      )

      const reason = new Error('consumer canceled')
      await reader.cancel(reason)
      expect(await settled).toBe(false)
      expect(onCancel).toHaveBeenCalledWith(reason)
      expect(onSettled).toHaveBeenCalledTimes(1)
    })
  })

  describe('Node streams', () => {
    it('reports success after the readable stream reaches EOF', async () => {
      const source = new PassThrough()
      const { onSettled, settled } = observeSettlement()
      const output = trackNodeStreamCompletion(source, onSettled)
      const chunks: Buffer[] = []
      output.on('data', (chunk: Buffer) => chunks.push(chunk))

      const firstChunk = once(output, 'data')
      source.write('first ')
      await firstChunk
      expect(onSettled).not.toHaveBeenCalled()

      const ended = once(output, 'end')
      source.end('last')
      await ended
      expect(Buffer.concat(chunks).toString()).toBe('first last')
      expect(await settled).toBe(true)
      expect(onSettled).toHaveBeenCalledTimes(1)
    })

    it('preserves a source error and reports failure', async () => {
      const source = new PassThrough()
      const { onSettled, settled } = observeSettlement()
      const output = trackNodeStreamCompletion(source, onSettled)
      const error = new Error('source failed')
      const errored = once(output, 'error')
      const closed = new Promise<void>((resolve) =>
        output.once('close', resolve)
      )

      source.destroy(error)
      expect((await errored)[0]).toBe(error)
      await closed
      expect(await settled).toBe(false)
      expect(onSettled).toHaveBeenCalledTimes(1)
    })

    it('reports failure on premature close', async () => {
      const source = new PassThrough()
      const { onSettled, settled } = observeSettlement()
      const output = trackNodeStreamCompletion(source, onSettled)
      const closed = once(output, 'close')

      source.destroy()
      await closed
      expect(await settled).toBe(false)
      expect(onSettled).toHaveBeenCalledTimes(1)
    })

    it('recognizes a stream that already ended', async () => {
      const source = new PassThrough()
      const ended = once(source, 'end')
      source.resume()
      source.end('done')
      await ended

      const { onSettled, settled } = observeSettlement()
      trackNodeStreamCompletion(source, onSettled)
      expect(await settled).toBe(true)
      expect(onSettled).toHaveBeenCalledTimes(1)
    })
  })
})
