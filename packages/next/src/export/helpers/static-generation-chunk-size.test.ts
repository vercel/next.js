import { getStaticGenerationChunkSize } from './static-generation-chunk-size'

describe('getStaticGenerationChunkSize', () => {
  it('uses the configured size', () => {
    expect(getStaticGenerationChunkSize(1000, 4, 3)).toBe(3)
  })

  it('aims for about eight chunks per worker', () => {
    // 160 pages / (2 workers * 8) = 10
    expect(getStaticGenerationChunkSize(160, 2, undefined)).toBe(10)
  })

  it('stays between 5 and 25 pages', () => {
    expect(getStaticGenerationChunkSize(10, 4, undefined)).toBe(5)
    expect(getStaticGenerationChunkSize(100_000, 2, undefined)).toBe(25)
  })
})
