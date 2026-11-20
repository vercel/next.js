import { nextTestSetup } from 'e2e-utils'

describe('utf8-filename', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should build without errors for emoji filenames', async () => {
    // This test ensures the build process handles emoji filenames correctly
    const html = await next.render('/long-title-with-utf-8')
    expect(html).toContain('UTF-8 Filename Test')
  })
})
