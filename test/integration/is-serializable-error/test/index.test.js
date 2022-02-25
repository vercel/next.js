import { nextBuild } from 'next-test-utils'
import { join } from 'path'

describe('isSerializable error', () => {
  it('should show proper error during build', async () => {
    const { stderr } = await nextBuild(join(__dirname, '../'), undefined, {
      stderr: true,
    })
    expect(stderr).toContain(
      'Error serializing `.hello` returned from `getStaticProps` in "/".'
    )
    expect(stderr).toContain(
      'Reason: `undefined` cannot be serialized as JSON. Please use `null` or omit this value.'
    )
    expect(stderr).toMatch(
      /at getStaticProps.*?\.next[/\\]server[/\\]pages[/\\]index\.js/
    )
  })
})
