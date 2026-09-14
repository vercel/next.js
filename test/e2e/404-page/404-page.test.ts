import { nextTestSetup, isNextDev, isNextStart } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('404 Page Support', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
  })

  const gip404Err =
    /`pages\/404` can not have getInitialProps\/getServerSideProps/

  it('should use pages/404', async () => {
    const html = await next.render('/abc')
    expect(html).toContain('custom 404 page')
  })

  it('should set correct status code with pages/404', async () => {
    const res = await next.fetch('/abc')
    expect(res.status).toBe(404)
  })

  it('should use pages/404 for .d.ts file', async () => {
    const html = await next.render('/invalidExtension')
    expect(html).toContain('custom 404 page')
  })

  it('should not error when visited directly', async () => {
    const res = await next.fetch('/404')
    expect(res.status).toBe(404)
    expect(await res.text()).toContain('custom 404 page')
  })

  it('should render _error for a 500 error still', async () => {
    const html = await next.render('/err')
    expect(html).not.toContain('custom 404 page')
    expect(html).toContain(isNextDev ? 'oops' : 'Internal Server Error')
  })

  if (isNextStart) {
    it('should output 404.html during build', async () => {
      const manifest = await next.readJSON('.next/server/pages-manifest.json')
      const page = manifest['/404']
      expect(page.endsWith('.html')).toBe(true)
    })

    it('should still output 404.js anyway', async () => {
      expect(await next.hasFile('.next/server/pages/404.js')).toBe(true)
    })

    it('should add /404 to pages-manifest correctly', async () => {
      const manifest = await next.readJSON('.next/server/pages-manifest.json')
      expect('/404' in manifest).toBe(true)
    })
  }

  if (isNextDev) {
    it('falls back to _error correctly without pages/404', async () => {
      const original404 = await next.readFile('pages/404.js')
      try {
        await next.deleteFile('pages/404.js')
        await retry(async () => {
          const res = await next.fetch('/abc')
          expect(res.status).toBe(404)
          expect(await res.text()).toContain('This page could not be found')
        })
      } finally {
        await next.patchFile('pages/404.js', original404)
      }
    })

    it('shows error with getInitialProps in pages/404 dev', async () => {
      const original404 = await next.readFile('pages/404.js')
      try {
        await next.patchFile(
          'pages/404.js',
          `
          const page = () => 'custom 404 page'
          page.getInitialProps = () => ({ a: 'b' })
          export default page
        `
        )
        await next.render('/abc')
        await retry(async () => {
          expect(next.cliOutput).toMatch(gip404Err)
        })
      } finally {
        await next.patchFile('pages/404.js', original404)
      }
    })

    it('does not show error with getStaticProps in pages/404 dev', async () => {
      const original404 = await next.readFile('pages/404.js')
      const getOutput = next.getCliOutputFromHere()
      try {
        await next.patchFile(
          'pages/404.js',
          `
          const page = () => 'custom 404 page'
          export const getStaticProps = () => ({ props: { a: 'b' } })
          export default page
        `
        )
        await next.render('/abc')
        await retry(async () => {
          const html = await next.render('/abc')
          expect(html).toContain('custom 404 page')
        })
        expect(getOutput()).not.toMatch(gip404Err)
      } finally {
        await next.patchFile('pages/404.js', original404)
      }
    })

    it('shows error with getServerSideProps in pages/404 dev', async () => {
      const original404 = await next.readFile('pages/404.js')
      try {
        await next.patchFile(
          'pages/404.js',
          `
          const page = () => 'custom 404 page'
          export const getServerSideProps = () => ({ props: { a: 'b' } })
          export default page
        `
        )
        await next.render('/abc')
        await retry(async () => {
          expect(next.cliOutput).toMatch(gip404Err)
        })
      } finally {
        await next.patchFile('pages/404.js', original404)
      }
    })
  }
})
;(isNextStart ? describe : describe.skip)('404 Page build validation', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
    skipStart: true,
    skipDeployment: true,
  })
  if (skipped) return

  const gip404Err =
    /`pages\/404` can not have getInitialProps\/getServerSideProps/
  const original404Content = `const page = () => 'custom 404 page'
export default page
`

  beforeEach(async () => {
    // Restore original 404.js content before each test
    await next.patchFile('pages/404.js', original404Content)
    // Stop server if running
    try {
      await next.stop()
    } catch (e) {
      // Ignore if already stopped
    }
  })

  it('shows error with getInitialProps in pages/404 build', async () => {
    await next.patchFile(
      'pages/404.js',
      `
      const page = () => 'custom 404 page'
      page.getInitialProps = () => ({ a: 'b' })
      export default page
    `
    )
    const { exitCode } = await next.build()
    expect(exitCode).toBe(1)
    expect(next.cliOutput).toMatch(gip404Err)
  })

  it('does not show error with getStaticProps in pages/404 build', async () => {
    await next.patchFile(
      'pages/404.js',
      `
      const page = () => 'custom 404 page'
      export const getStaticProps = () => ({ props: { a: 'b' } })
      export default page
    `
    )
    const { exitCode, cliOutput } = await next.build()
    expect(exitCode).toBe(0)
    expect(cliOutput).not.toMatch(gip404Err)
  })

  it('shows error with getServerSideProps in pages/404 build', async () => {
    await next.patchFile(
      'pages/404.js',
      `
      const page = () => 'custom 404 page'
      export const getServerSideProps = () => ({ props: { a: 'b' } })
      export default page
    `
    )
    const { exitCode } = await next.build()
    expect(exitCode).toBe(1)
    expect(next.cliOutput).toMatch(gip404Err)
  })

  it('should not cache for custom 404 page with gssp and revalidate disabled', async () => {
    await next.patchFile(
      'pages/404.js',
      `
      const page = () => 'custom 404 page'
      export async function getStaticProps() { return { props: {} } }
      export default page
    `
    )
    const { exitCode } = await next.build()
    expect(exitCode).toBe(0)
    await next.start()

    const res404 = await next.fetch('/404')
    const resNext = await next.fetch('/_next/abc')

    expect(res404.headers.get('Cache-Control')).toBe(
      'private, no-cache, no-store, max-age=0, must-revalidate'
    )
    expect(resNext.headers.get('Cache-Control')).toBe(
      'private, no-cache, no-store, max-age=0, must-revalidate'
    )
  })

  it('should not cache for custom 404 page with gssp and revalidate enabled', async () => {
    await next.patchFile(
      'pages/404.js',
      `
      const page = () => 'custom 404 page'
      export async function getStaticProps() { return { props: {}, revalidate: 1 } }
      export default page
    `
    )
    const { exitCode } = await next.build()
    expect(exitCode).toBe(0)
    await next.start()

    const res404 = await next.fetch('/404')
    const resNext = await next.fetch('/_next/abc')

    expect(res404.headers.get('Cache-Control')).toBe(
      'private, no-cache, no-store, max-age=0, must-revalidate'
    )
    expect(resNext.headers.get('Cache-Control')).toBe(
      'private, no-cache, no-store, max-age=0, must-revalidate'
    )
  })

  it('should not cache for custom 404 page without gssp', async () => {
    const { exitCode } = await next.build()
    expect(exitCode).toBe(0)
    await next.start()

    const res404 = await next.fetch('/404')
    const resNext = await next.fetch('/_next/abc')

    expect(res404.headers.get('Cache-Control')).toBe(null)
    expect(resNext.headers.get('Cache-Control')).toBe(
      'private, no-cache, no-store, max-age=0, must-revalidate'
    )
  })
})
