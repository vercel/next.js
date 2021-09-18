/* eslint-env jest */
import { nextBuild } from 'next-test-utils'
import { join } from 'path'

jest.setTimeout(1000 * 60 * 2)

describe('Invalid static image import in _document', () => {
  it('Should fail to build', async () => {
    const appDir = join(__dirname, '..')
    const { code, stderr } = await nextBuild(appDir, [], {
      stderr: true,
    })
    expect(code).not.toBe(0)
    expect(stderr).toContain('Failed to compile')
    expect(stderr).toMatch(
      /Images.*cannot.*be imported within.*pages[\\/]_document\.js/
    )
    expect(stderr).toMatch(/Location:.*pages[\\/]_document\.js/)
  })
})
