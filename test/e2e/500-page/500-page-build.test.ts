import { isNextDev, nextTestSetup } from 'e2e-utils'

// This test exercises `next build` outputs and `next start` behaviour, so it
// is meaningless in dev mode where the dev server bypasses production build
// artifacts (e.g. statically prerendered 500.html from getStaticProps).
;(isNextDev ? describe.skip : describe)('500 Page build validation', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
    skipStart: true,
    skipDeployment: true,
  })
  if (skipped) return

  const gip500Err =
    /`pages\/500` can not have getInitialProps\/getServerSideProps/

  beforeEach(async () => {
    // Reset to original 500.js before each test
    await next.patchFile(
      'pages/500.js',
      `const page = () => {
  console.log('rendered 500')
  return 'custom 500 page'
}
export default page
`
    )
  })

  it('shows error with getInitialProps in pages/500 build', async () => {
    await next.patchFile(
      'pages/500.js',
      `
      const page = () => 'custom 500 page'
      page.getInitialProps = () => ({ a: 'b' })
      export default page
    `
    )
    const { exitCode } = await next.build()
    expect(exitCode).toBe(1)
    expect(next.cliOutput).toMatch(gip500Err)
  })

  it('does not show error with getStaticProps in pages/500 build', async () => {
    await next.patchFile(
      'pages/500.js',
      `
      const page = () => 'custom 500 page'
      export const getStaticProps = () => ({ props: { a: 'b' } })
      export default page
    `
    )
    const { exitCode, cliOutput } = await next.build()
    expect(exitCode).toBe(0)
    expect(cliOutput).not.toMatch(gip500Err)
  })

  it('shows error with getServerSideProps in pages/500 build', async () => {
    await next.patchFile(
      'pages/500.js',
      `
      const page = () => 'custom 500 page'
      export const getServerSideProps = () => ({ props: { a: 'b' } })
      export default page
    `
    )
    const { exitCode } = await next.build()
    expect(exitCode).toBe(1)
    expect(next.cliOutput).toMatch(gip500Err)
  })

  it('should have correct cache control for 500 page with getStaticProps', async () => {
    await next.patchFile(
      'pages/500.js',
      `
      export default function Page() {
        return <p>custom 500</p>
      }
      export function getStaticProps() {
        return { props: { now: Date.now() } }
      }
    `
    )
    const { exitCode } = await next.build()
    expect(exitCode).toBe(0)
    await next.start({ skipBuild: true })

    try {
      const res = await next.fetch('/err')
      expect(res.status).toBe(500)
      expect(res.headers.get('cache-control')).toBe(
        'private, no-cache, no-store, max-age=0, must-revalidate'
      )
    } finally {
      await next.stop()
    }
  })

  it('does not build 500 statically with getInitialProps in _app', async () => {
    await next.patchFile(
      'pages/_app.js',
      `
      import App from 'next/app'
      const page = ({ Component, pageProps }) => <Component {...pageProps} />
      page.getInitialProps = (ctx) => App.getInitialProps(ctx)
      export default page
    `
    )
    const { exitCode, cliOutput } = await next.build()
    expect(exitCode).toBe(0)
    expect(cliOutput).not.toMatch(gip500Err)
    expect(cliOutput).not.toContain('rendered 500')
    expect(await next.hasFile('.next/server/pages/500.html')).toBe(false)

    await next.start({ skipBuild: true })
    try {
      const res = await next.fetch('/err')
      expect(res.status).toBe(500)
      // Verify the page was rendered at runtime by checking response
      expect(await res.text()).toContain('custom 500 page')
    } finally {
      await next.stop()
    }

    await next.deleteFile('pages/_app.js')
  })

  it('does build 500 statically with getInitialProps in _app and getStaticProps in pages/500', async () => {
    await next.patchFile(
      'pages/_app.js',
      `
      import App from 'next/app'
      const page = ({ Component, pageProps }) => <Component {...pageProps} />
      page.getInitialProps = (ctx) => App.getInitialProps(ctx)
      export default page
    `
    )
    await next.patchFile(
      'pages/500.js',
      `
      const page = () => {
        console.log('rendered 500')
        return 'custom 500 page'
      }
      export default page
      export const getStaticProps = () => {
        return { props: {} }
      }
    `
    )
    const { exitCode, cliOutput } = await next.build()
    expect(exitCode).toBe(0)
    expect(cliOutput).not.toMatch(gip500Err)
    expect(cliOutput).toContain('rendered 500')
    expect(await next.hasFile('.next/server/pages/500.html')).toBe(true)

    const outputBeforeStart = next.cliOutput.length
    await next.start({ skipBuild: true })
    try {
      await next.render('/err')
      expect(next.cliOutput.substring(outputBeforeStart)).not.toContain(
        'rendered 500'
      )
    } finally {
      await next.stop()
    }

    await next.deleteFile('pages/_app.js')
  })

  it('builds 500 statically by default with no pages/500', async () => {
    await next.deleteFile('pages/500.js')
    const { exitCode } = await next.build()
    expect(exitCode).toBe(0)
    expect(next.cliOutput).not.toMatch(gip500Err)
    expect(await next.hasFile('.next/server/pages/500.html')).toBe(true)

    await next.start({ skipBuild: true })
    try {
      const browser = await next.browser('/err?hello=world')
      const initialTitle = await browser.eval('document.title')
      const currentTitle = await browser.eval('document.title')
      expect(initialTitle).toBe(currentTitle)
      expect(initialTitle).toBe('500: Internal Server Error')
    } finally {
      await next.stop()
    }
  })

  it('builds 500 statically by default with no pages/500 and custom _error without getInitialProps', async () => {
    await next.deleteFile('pages/500.js')
    await next.patchFile(
      'pages/_error.js',
      `
      function Error({ statusCode }) {
        return <p>Error status: {statusCode}</p>
      }
      export default Error
    `
    )
    const { exitCode } = await next.build()
    expect(exitCode).toBe(0)
    expect(next.cliOutput).not.toMatch(gip500Err)
    expect(await next.hasFile('.next/server/pages/500.html')).toBe(true)
    await next.deleteFile('pages/_error.js')
  })

  it('does not build 500 statically with no pages/500 and custom getInitialProps in _error', async () => {
    await next.deleteFile('pages/500.js')
    await next.patchFile(
      'pages/_error.js',
      `
      function Error({ statusCode }) {
        return <p>Error status: {statusCode}</p>
      }
      Error.getInitialProps = ({ req, res, err }) => {
        console.error('called _error.getInitialProps')
        if (req.url === '/500') {
          throw new Error('should not export /500')
        }
        return {
          statusCode: res && res.statusCode ? res.statusCode : err ? err.statusCode : 404
        }
      }
      export default Error
    `
    )
    const { exitCode } = await next.build()
    expect(exitCode).toBe(0)
    expect(next.cliOutput).not.toMatch(gip500Err)
    expect(await next.hasFile('.next/server/pages/500.html')).toBe(false)

    await next.start({ skipBuild: true })
    try {
      const res = await next.fetch('/err')
      expect(res.status).toBe(500)
      // Verify _error.getInitialProps is called at runtime by checking response content
      const text = await res.text()
      expect(text).toContain('Error status:')
      expect(text).toContain('500')
    } finally {
      await next.stop()
    }

    await next.deleteFile('pages/_error.js')
  })

  it('does not build 500 statically with no pages/500 and custom getInitialProps in _error and _app', async () => {
    await next.deleteFile('pages/500.js')
    await next.patchFile(
      'pages/_error.js',
      `
      function Error({ statusCode }) {
        return <p>Error status: {statusCode}</p>
      }
      Error.getInitialProps = ({ req, res, err }) => {
        console.error('called _error.getInitialProps')
        if (req.url === '/500') {
          throw new Error('should not export /500')
        }
        return {
          statusCode: res && res.statusCode ? res.statusCode : err ? err.statusCode : 404
        }
      }
      export default Error
    `
    )
    await next.patchFile(
      'pages/_app.js',
      `
      function App({ pageProps, Component }) {
        return <Component {...pageProps} />
      }
      App.getInitialProps = async ({ Component, ctx }) => {
        let pageProps = {}
        if (Component.getInitialProps) {
          pageProps = await Component.getInitialProps(ctx)
        }
        return { pageProps }
      }
      export default App
    `
    )
    const { exitCode } = await next.build()
    expect(exitCode).toBe(0)
    expect(next.cliOutput).not.toMatch(gip500Err)
    expect(await next.hasFile('.next/server/pages/500.html')).toBe(false)
    await next.deleteFile('pages/_error.js')
    await next.deleteFile('pages/_app.js')
  })

  it('does not build 500 statically with no pages/500 and getServerSideProps in _error', async () => {
    await next.deleteFile('pages/500.js')
    await next.patchFile(
      'pages/_error.js',
      `
      function Error({ statusCode }) {
        return <p>Error status: {statusCode}</p>
      }
      export const getServerSideProps = ({ req, res, err }) => {
        console.error('called _error getServerSideProps')
        if (req.url === '/500') {
          throw new Error('should not export /500')
        }
        return {
          props: {
            statusCode: res && res.statusCode ? res.statusCode : err ? err.statusCode : 404
          }
        }
      }
      export default Error
    `
    )
    const { exitCode } = await next.build()
    expect(exitCode).toBe(0)
    expect(next.cliOutput).not.toMatch(gip500Err)
    expect(await next.hasFile('.next/server/pages/500.html')).toBe(false)

    await next.start({ skipBuild: true })
    try {
      const res = await next.fetch('/err')
      expect(res.status).toBe(500)
      // Verify _error getServerSideProps is called at runtime by checking response content
      const text = await res.text()
      expect(text).toContain('Error status:')
      expect(text).toContain('500')
    } finally {
      await next.stop()
    }

    await next.deleteFile('pages/_error.js')
  })
})
