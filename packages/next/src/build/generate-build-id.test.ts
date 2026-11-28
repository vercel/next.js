import { generateBuildId } from './generate-build-id'

const fallback = () => 'fallback-id'

describe('generateBuildId', () => {
  it('uses the fallback when no generator is configured', async () => {
    expect(await generateBuildId(undefined, fallback)).toBe('fallback-id')
  })

  it('uses the fallback when the generator returns null', async () => {
    expect(await generateBuildId(() => null, fallback)).toBe('fallback-id')
  })

  it('returns the trimmed custom build ID', async () => {
    expect(await generateBuildId(async () => ' release-v1 ', fallback)).toBe(
      'release-v1'
    )
  })

  it('throws when the generator does not return a string', async () => {
    await expect(
      generateBuildId(() => 1 as unknown as string, fallback)
    ).rejects.toThrow('generateBuildId did not return a string')
  })

  it.each([
    ['a slash', 'release/v1'],
    ['a backslash', 'release\\v1'],
    ['a question mark', 'v1?beta'],
    ['a hash', 'v1#beta'],
    ['whitespace', 'release v1'],
    ['nothing', '   '],
  ])(
    'throws when the custom build ID contains %s',
    async (_description, buildId) => {
      await expect(generateBuildId(() => buildId, fallback)).rejects.toThrow(
        "can't be used as a build ID"
      )
    }
  )
})
