import { getStaticGenerationChunkSize } from './static-generation-chunk-size'

describe('getStaticGenerationChunkSize', () => {
  it('uses the configured size', () => {
    expect(getStaticGenerationChunkSize(1000, 4, 8, 5)).toBe(5)
  })

  it('aims for about four chunks per worker', () => {
    // 160 pages / (2 workers * 4) = 20
    expect(getStaticGenerationChunkSize(160, 2, 8, undefined)).toBe(20)
  })

  it('never goes below one concurrency window', () => {
    expect(getStaticGenerationChunkSize(10, 4, 8, undefined)).toBe(8)
  })

  it('caps chunks at three concurrency windows', () => {
    expect(getStaticGenerationChunkSize(100_000, 2, 8, undefined)).toBe(24)
  })
})
