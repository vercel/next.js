import { nextTestSetup, isNextStart } from 'e2e-utils'

describe('404 Page Support SSG', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
    disableAutoSkewProtection: true,
    // Assertions don't apply to deploy mode (output differs vs. local Next.js server).
    skipDeployment: true,
  })
  if (skipped) return

  it('should respond to 404 correctly', async () => {
    const res = await next.fetch('/404')
    expect(res.status).toBe(404)
    expect(await res.text()).toContain('custom 404 page')
  })

  it('should render error correctly', async () => {
    const text = await next.render('/err')
    if (isNextStart) {
      expect(text).toContain('Internal Server Error')
    } else {
      expect(text).toContain('oops')
    }
  })

  it('should not show an error in the logs for 404 SSG', async () => {
    const gip404Err =
      /`pages\/404` can not have getInitialProps\/getServerSideProps/
    await next.render('/non-existent')
    expect(next.cliOutput).not.toMatch(gip404Err)
  })

  it('should render index page normal', async () => {
    const html = await next.render('/')
    expect(html).toContain('hello from index')
  })

  if (isNextStart) {
    it('should not revalidate custom 404 page', async () => {
      const res1 = await next.render('/non-existent')
      const res2 = await next.render('/non-existent')
      const res3 = await next.render('/non-existent')
      const res4 = await next.render('/non-existent')

      expect(res1 === res2 && res2 === res3 && res3 === res4).toBe(true)
      expect(res1).toContain('custom 404 page')
    })

    it('should set pages404 in routes-manifest correctly', async () => {
      const data = await next.readJSON('.next/routes-manifest.json')
      expect(data.pages404).toBe(true)
    })

    it('should have 404 page in prerender-manifest', async () => {
      const data = await next.readJSON('.next/prerender-manifest.json')
      expect(data.routes['/404']).toEqual({
        allowHeader: [
          'host',
          'x-matched-path',
          'x-prerender-revalidate',
          'x-prerender-revalidate-if-generated',
          'x-next-revalidated-tags',
          'x-next-revalidate-tag-token',
        ],
        initialRevalidateSeconds: false,
        srcRoute: null,
        dataRoute: `/_next/data/${next.buildId}/404.json`,
      })
    })
  }
})
