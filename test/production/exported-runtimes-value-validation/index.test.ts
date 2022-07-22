import { nextBuild } from 'next-test-utils'
import path from 'path'

describe('Exported runtimes value validation', () => {
  test('fails to build on malformed input', async () => {
    const result = await nextBuild(
      path.resolve(__dirname, './invalid-runtime/app'),
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

  test('warns on unrecognized runtimes value', async () => {
    const result = await nextBuild(
      path.resolve(__dirname, './unsupported-syntax/app'),
      undefined,
      { stdout: true, stderr: true }
    )

    expect(result).toMatchObject({
      code: 0,
      stderr: expect.stringContaining(
        `You have exported a \`config\` field in route "/" that Next.js can't recognize, so it will be ignored`
      ),
    })
  })
})
