import { generateBuildId } from './generate-build-id'

const fallback = () => 'fallback-id'

describe('generateBuildId', () => {
  it('returns the trimmed custom build id', async () => {
    await expect(
      generateBuildId(() => '  custom-id  ', fallback)
    ).resolves.toBe('custom-id')
  })

  it('uses the fallback when generate returns null', async () => {
    await expect(generateBuildId(() => null, fallback)).resolves.toBe(
      'fallback-id'
    )
  })

  it('rejects a build id that is not a string', async () => {
    await expect(
      generateBuildId(() => 5 as unknown as string, fallback)
    ).rejects.toThrow('generateBuildId did not return a string')
  })

  it('rejects a build id containing a slash', async () => {
    await expect(
      generateBuildId(async () => 'release/v1', fallback)
    ).rejects.toThrow(
      'generateBuildId returned "release/v1", which contains a "/"'
    )
  })
})
