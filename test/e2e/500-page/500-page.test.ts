import { nextTestSetup, isNextDev, isNextStart } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('500 Page Support', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
  })
  if (skipped) return

  it('should use pages/500', async () => {
    const html = await next.render('/500')
    expect(html).toContain('custom 500 page')
  })

  it('should set correct status code with pages/500', async () => {
    const res = await next.fetch('/500')
    expect(res.status).toBe(500)
  })

  it('should not error when visited directly', async () => {
    const res = await next.fetch('/500')
    expect(res.status).toBe(500)
    expect(await res.text()).toContain('custom 500 page')
  })

  if (isNextStart) {
    it('should output 500.html during build', async () => {
      const manifest = await next.readJSON('.next/server/pages-manifest.json')
      const page = manifest['/500']
      expect(page.endsWith('.html')).toBe(true)
    })

    it('should add /500 to pages-manifest correctly', async () => {
      const manifest = await next.readJSON('.next/server/pages-manifest.json')
      expect('/500' in manifest).toBe(true)
    })
  }

  if (isNextDev) {
    it('shows error with getInitialProps in pages/500 dev', async () => {
      const original500 = await next.readFile('pages/500.js')
      try {
        await next.patchFile(
          'pages/500.js',
          `
          const page = () => 'custom 500 page'
          page.getInitialProps = () => ({ a: 'b' })
          export default page
        `
        )
        await next.render('/500')
        await retry(async () => {
          expect(next.cliOutput).toMatch(
            /`pages\/500` can not have getInitialProps\/getServerSideProps/
          )
        })
      } finally {
        await next.patchFile('pages/500.js', original500)
      }
    })

    it('does not show error with getStaticProps in pages/500 dev', async () => {
      const original500 = await next.readFile('pages/500.js')
      const outputBefore = next.cliOutput.length
      try {
        await next.patchFile(
          'pages/500.js',
          `
          const page = () => 'custom 500 page'
          export const getStaticProps = () => ({ props: { a: 'b' } })
          export default page
        `
        )
        await next.render('/abc')
        await retry(async () => {
          expect(next.cliOutput.slice(outputBefore)).not.toMatch(
            /`pages\/500` can not have getInitialProps\/getServerSideProps/
          )
        })
      } finally {
        await next.patchFile('pages/500.js', original500)
      }
    })

    it('shows error with getServerSideProps in pages/500 dev', async () => {
      const original500 = await next.readFile('pages/500.js')
      try {
        await next.patchFile(
          'pages/500.js',
          `
          const page = () => 'custom 500 page'
          export const getServerSideProps = () => ({ props: { a: 'b' } })
          export default page
        `
        )
        await next.render('/500')
        await retry(async () => {
          expect(next.cliOutput).toMatch(
            /`pages\/500` can not have getInitialProps\/getServerSideProps/
          )
        })
      } finally {
        await next.patchFile('pages/500.js', original500)
      }
    })
  }
})
