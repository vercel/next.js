import { PassThrough } from 'node:stream'
import { ReplayableNodeStream } from './app-render-prerender-utils'

function collectBytes(
  stream: import('node:stream').Readable
): Promise<number[][]> {
  return new Promise((resolve, reject) => {
    const chunks: number[][] = []
    stream.on('data', (chunk: Buffer) => chunks.push(Array.from(chunk)))
    stream.on('end', () => resolve(chunks))
    stream.on('error', reject)
  })
}

function tick(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve))
}

describe('ReplayableNodeStream', () => {
  describe('construction and buffering', () => {
    it('buffers Uint8Array chunks from the source', async () => {
      const source = new PassThrough()
      const replayable = new ReplayableNodeStream(source)

      source.write(new Uint8Array([1, 2, 3]))
      source.write(new Uint8Array([4, 5, 6]))

      const ended = new Promise<void>((r) => source.on('end', r))
      source.end()
      await ended

      const collected = await collectBytes(replayable.createReplayStream())
      expect(collected).toEqual([
        [1, 2, 3],
        [4, 5, 6],
      ])
    })

    it('converts Buffer chunks to Uint8Array before buffering', async () => {
      const source = new PassThrough()
      const replayable = new ReplayableNodeStream(source)

      source.write(Buffer.from([10, 20, 30]))

      const ended = new Promise<void>((r) => source.on('end', r))
      source.end()
      await ended

      const collected = await collectBytes(replayable.createReplayStream())
      expect(collected).toEqual([[10, 20, 30]])
    })

    it('handles an immediately-ending empty stream', async () => {
      const source = new PassThrough()
      const replayable = new ReplayableNodeStream(source)

      const ended = new Promise<void>((r) => source.on('end', r))
      source.end()
      await ended

      const collected = await collectBytes(replayable.createReplayStream())
      expect(collected).toEqual([])
    })
  })

  describe('createReplayStream – replay after source completes', () => {
    it('replays all buffered chunks and ends', async () => {
      const source = new PassThrough()
      const replayable = new ReplayableNodeStream(source)

      source.write(new Uint8Array([1, 2]))
      source.write(new Uint8Array([3, 4]))
      source.write(new Uint8Array([5, 6]))

      const ended = new Promise<void>((r) => source.on('end', r))
      source.end()
      await ended

      const collected = await collectBytes(replayable.createReplayStream())
      expect(collected).toEqual([
        [1, 2],
        [3, 4],
        [5, 6],
      ])
    })

    it('returns chunks in original order', async () => {
      const source = new PassThrough()
      const replayable = new ReplayableNodeStream(source)

      for (let i = 0; i < 10; i++) {
        source.write(new Uint8Array([i]))
      }

      const ended = new Promise<void>((r) => source.on('end', r))
      source.end()
      await ended

      const collected = await collectBytes(replayable.createReplayStream())
      const expected = Array.from({ length: 10 }, (_, i) => [i])
      expect(collected).toEqual(expected)
    })

    it('replay from empty finished source emits no data then ends', async () => {
      const source = new PassThrough()
      const replayable = new ReplayableNodeStream(source)

      const ended = new Promise<void>((r) => source.on('end', r))
      source.end()
      await ended

      const collected = await collectBytes(replayable.createReplayStream())
      expect(collected).toEqual([])
    })
  })

  describe('createReplayStream – live source (still streaming)', () => {
    it('replays buffered chunks first then forwards new chunks', async () => {
      const source = new PassThrough()
      const replayable = new ReplayableNodeStream(source)

      source.write(new Uint8Array([1, 2]))

      const replay = replayable.createReplayStream()
      const collectPromise = collectBytes(replay)

      // Let _read() fire and drain the buffer before pushing live data.
      await tick()

      source.write(new Uint8Array([3, 4]))
      source.end()

      const collected = await collectPromise
      expect(collected).toEqual([
        [1, 2],
        [3, 4],
      ])
    })

    it('onEnd from source closes the replay stream', async () => {
      const source = new PassThrough()
      const replayable = new ReplayableNodeStream(source)

      const replay = replayable.createReplayStream()
      const replayEnded = new Promise<void>((r) => replay.on('end', r))
      replay.resume()

      source.end()
      await replayEnded
    })

    it('onError from source destroys the replay stream', async () => {
      const source = new PassThrough()
      const replayable = new ReplayableNodeStream(source)

      const replay = replayable.createReplayStream()
      const errorPromise = new Promise<Error>((resolve) => {
        replay.on('error', resolve)
      })

      const testError = new Error('source failed')
      source.destroy(testError)

      const received = await errorPromise
      expect(received).toBe(testError)
    })
  })

  describe('createReplayStream – error before replay', () => {
    it('immediately destroys replay if source already errored', async () => {
      const source = new PassThrough()
      const replayable = new ReplayableNodeStream(source)

      const testError = new Error('already broken')
      source.destroy(testError)
      await tick()

      const replay = replayable.createReplayStream()
      const errorPromise = new Promise<Error>((resolve) => {
        replay.on('error', resolve)
      })

      const received = await errorPromise
      expect(received).toBe(testError)
    })
  })

  describe('multiple independent replay streams', () => {
    it('each replay stream receives all buffered and live chunks', async () => {
      const source = new PassThrough()
      const replayable = new ReplayableNodeStream(source)

      source.write(new Uint8Array([1]))
      source.write(new Uint8Array([2]))

      const replay1 = replayable.createReplayStream()
      const replay2 = replayable.createReplayStream()

      const collect1 = collectBytes(replay1)
      const collect2 = collectBytes(replay2)

      // Let _read() drain buffers before pushing live data.
      await tick()

      source.write(new Uint8Array([3]))
      source.end()

      const [collected1, collected2] = await Promise.all([collect1, collect2])

      expect(collected1).toEqual([[1], [2], [3]])
      expect(collected2).toEqual([[1], [2], [3]])
    })

    it('closing one replay stream does not affect the other', async () => {
      const source = new PassThrough()
      const replayable = new ReplayableNodeStream(source)

      const replay1 = replayable.createReplayStream()
      const replay2 = replayable.createReplayStream()

      replay1.destroy()

      source.write(new Uint8Array([42]))
      source.end()

      const collected2 = await collectBytes(replay2)
      expect(collected2).toEqual([[42]])
    })
  })

  describe('subscriber cleanup', () => {
    it('removes subscriber when replay stream is closed', async () => {
      const source = new PassThrough()
      const replayable = new ReplayableNodeStream(source)

      const replay = replayable.createReplayStream()

      const subscribers = (replayable as any)._subscribers as Set<unknown>
      expect(subscribers.size).toBe(1)

      const closed = new Promise<void>((r) => replay.on('close', r))
      replay.destroy()
      await closed

      expect(subscribers.size).toBe(0)
    })

    it('does not register a subscriber when source already ended', async () => {
      const source = new PassThrough()
      const replayable = new ReplayableNodeStream(source)

      const ended = new Promise<void>((r) => source.on('end', r))
      source.end()
      await ended

      replayable.createReplayStream()

      const subscribers = (replayable as any)._subscribers as Set<unknown>
      expect(subscribers.size).toBe(0)
    })

    it('does not register a subscriber when source already errored', async () => {
      const source = new PassThrough()
      const replayable = new ReplayableNodeStream(source)

      source.destroy(new Error('boom'))
      await tick()

      const replay = replayable.createReplayStream()
      replay.on('error', () => {})

      const subscribers = (replayable as any)._subscribers as Set<unknown>
      expect(subscribers.size).toBe(0)
    })
  })

  describe('data after dispose', () => {
    it('does not crash when source emits data after dispose', async () => {
      const source = new PassThrough()
      const replayable = new ReplayableNodeStream(source)

      source.write(new Uint8Array([1]))
      replayable.dispose()

      // Source keeps emitting after dispose — should not throw.
      source.write(new Uint8Array([2]))
      source.end()
      await tick()
    })
  })

  describe('error after partial data', () => {
    it('replay gets error even when chunks were buffered before error', async () => {
      const source = new PassThrough()
      const replayable = new ReplayableNodeStream(source)

      source.write(new Uint8Array([1, 2, 3]))

      const testError = new Error('mid-stream failure')
      source.destroy(testError)
      await tick()

      const replay = replayable.createReplayStream()
      const errorPromise = new Promise<Error>((resolve) => {
        replay.on('error', resolve)
      })

      const received = await errorPromise
      expect(received).toBe(testError)
    })
  })

  describe('multiple replays from completed source', () => {
    it('each independently replays the full buffer', async () => {
      const source = new PassThrough()
      const replayable = new ReplayableNodeStream(source)

      source.write(new Uint8Array([10]))
      source.write(new Uint8Array([20]))

      const ended = new Promise<void>((r) => source.on('end', r))
      source.end()
      await ended

      const collected1 = await collectBytes(replayable.createReplayStream())
      const collected2 = await collectBytes(replayable.createReplayStream())
      const collected3 = await collectBytes(replayable.createReplayStream())

      expect(collected1).toEqual([[10], [20]])
      expect(collected2).toEqual([[10], [20]])
      expect(collected3).toEqual([[10], [20]])
    })
  })

  describe('dispose', () => {
    it('throws InvariantError when creating replay after dispose', () => {
      const source = new PassThrough()
      const replayable = new ReplayableNodeStream(source)

      replayable.dispose()

      expect(() => replayable.createReplayStream()).toThrow(
        /Cannot create a replay stream after the ReplayableNodeStream has been disposed/
      )
    })

    it('clears buffer but keeps subscribers so streams can still end', () => {
      const source = new PassThrough()
      const replayable = new ReplayableNodeStream(source)

      const replay = replayable.createReplayStream()

      expect((replayable as any)._chunks).not.toBeNull()
      expect((replayable as any)._subscribers.size).toBe(1)

      replayable.dispose()

      expect((replayable as any)._chunks).toBeNull()
      // Subscribers must NOT be cleared: the replay stream's onEnd subscriber
      // needs to remain active so the stream receives push(null) when the
      // source ends, otherwise the consumer never sees EOF.
      expect((replayable as any)._subscribers.size).toBe(1)

      replay.destroy()
    })

    it('replay stream still ends when source ends after dispose', async () => {
      const source = new PassThrough()
      const replayable = new ReplayableNodeStream(source)

      source.write(new Uint8Array([1, 2]))

      const replay = replayable.createReplayStream()
      replayable.dispose()

      const collectPromise = collectBytes(replay)

      // Let _read() drain buffered chunks before pushing live data.
      await tick()

      // Source ends after dispose — the replay stream should still close
      source.write(new Uint8Array([3, 4]))
      source.end()

      const collected = await collectPromise
      expect(collected).toEqual([
        [1, 2],
        [3, 4],
      ])
    })
  })
})
