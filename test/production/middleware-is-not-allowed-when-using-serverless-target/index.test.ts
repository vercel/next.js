import { nextBuild } from 'next-test-utils'
import path from 'path'

describe('Middleware is not allowed when using serverless target', () => {
  it('fails to build', async () => {
    const { code, stderr } = await nextBuild(
      path.resolve(__dirname, './app'),
      undefined,
      { ignoreFail: true, stderr: true }
    )
    expect(code).toEqual(1)
    expect(stderr).toContain('MiddlewareInServerlessTargetError')
  })
})
