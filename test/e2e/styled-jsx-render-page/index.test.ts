import { nextTestSetup } from 'e2e-utils'

describe('styled-jsx with custom _document renderPage', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
  })

  // When _document.getInitialProps calls ctx.renderPage() directly instead of
  // Document.getInitialProps(ctx), styled-jsx styles are lost because
  // defaultGetInitialProps is never called to collect them.
  it('should contain styled-jsx styles in <head> during SSR', async () => {
    const html = await next.render('/')
    // Styles must appear in <head>, not just anywhere in the HTML
    const headContent = html.match(/<head[^>]*>([\s\S]*?)<\/head>/i)?.[1] ?? ''
    expect(headContent).toMatch(/color:.*?red/)
  })
})
