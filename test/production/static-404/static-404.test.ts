import { nextTestSetup } from 'e2e-utils'

describe('static-404', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

  it('should export 404 page without custom _error', async () => {
    await next.build()
    await next.start()
    const html = await next.render('/non-existent')
    await next.stop()
    expect(html).toContain('This page could not be found')
  })

  it('should not export 404 page with custom _error GIP', async () => {
    await next.patchFile(
      'pages/_error.js',
      `
        import Error from 'next/error'
        export default class MyError extends Error {
          static getInitialProps({ statusCode, req }) {
            if (req.url === '/404' || req.url === '/404.html') {
              throw new Error('exported 404 unexpectedly!!!')
            }
            return {
              statusCode,
            }
          }
        }
      `
    )
    await next.build()
    await next.deleteFile('pages/_error.js')
  })

  it('should not export 404 page with getInitialProps in _app', async () => {
    await next.patchFile(
      'pages/_app.js',
      `
        const Page = ({ Component, pageProps }) => {
          return <Component {...pageProps} />
        }
        Page.getInitialProps = () => ({ hello: 'world', pageProps: {} })
        export default Page
      `
    )
    await next.build()
    await next.deleteFile('pages/_app.js')
  })
})
