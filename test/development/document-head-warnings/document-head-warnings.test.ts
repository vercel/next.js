import { nextTestSetup } from 'e2e-utils'

describe('Custom Document Head Warnings', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('warns when using a <title> in document/head', async () => {
    await next.render('/')
    expect(next.cliOutput).toMatch(
      /.*Warning: <title> should not be used in _document.js's <Head>\..*/
    )
  })

  it('warns when using viewport meta tags in document/head', async () => {
    await next.render('/')
    expect(next.cliOutput).toMatch(
      /.*Warning: viewport meta tags should not be used in _document.js's <Head>\..*/
    )
  })

  it('warns when using a crossOrigin attribute on document/head', async () => {
    await next.render('/')
    expect(next.cliOutput).toMatch(
      /.*Warning: `Head` attribute `crossOrigin` is deprecated\..*/
    )
  })
})
