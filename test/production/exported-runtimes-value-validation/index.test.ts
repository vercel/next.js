import { nextBuild } from 'next-test-utils'
import path from 'path'

describe('Exported runtimes value validation', () => {
  test('fails to build on malformed input', async () => {
    const result = await nextBuild(
      path.resolve(__dirname, './app'),
      undefined,
      { stdout: true, stderr: true }
    )
    expect(result).toMatchObject({
      code: 1,
      stderr: expect.stringContaining(
        `Provided runtime "something-odd" is not supported.`
      ),
    })
  })
})
