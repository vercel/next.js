import { takeReactDebugChunkForHmr } from './debug-channel'

describe('takeReactDebugChunkForHmr', () => {
  it('passes through chunks under the limit', () => {
    const chunk = new Uint8Array([1, 2, 3])
    const result = takeReactDebugChunkForHmr(chunk, 0, 10)

    expect(result.chunk).toBe(chunk)
    expect(result.bytesSent).toBe(3)
    expect(result.done).toBe(false)
  })

  it('truncates a chunk that would exceed the limit', () => {
    const chunk = new Uint8Array([1, 2, 3, 4, 5])
    const result = takeReactDebugChunkForHmr(chunk, 3, 10)

    expect(result.chunk).toEqual(new Uint8Array([4, 5]))
    expect(result.bytesSent).toBe(10)
    expect(result.done).toBe(true)
  })

  it('marks the stream done once the limit is reached', () => {
    const chunk = new Uint8Array([1, 2, 3])
    const result = takeReactDebugChunkForHmr(chunk, 8, 10)

    expect(result.chunk).toEqual(new Uint8Array([1, 2]))
    expect(result.bytesSent).toBe(10)
    expect(result.done).toBe(true)
  })

  it('returns done when already at the limit', () => {
    const chunk = new Uint8Array([1, 2, 3])
    const result = takeReactDebugChunkForHmr(chunk, 10, 10)

    expect(result.chunk).toBeNull()
    expect(result.bytesSent).toBe(10)
    expect(result.done).toBe(true)
  })
})
