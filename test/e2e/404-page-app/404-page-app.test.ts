import { nextTestSetup, isNextStart } from 'e2e-utils'

describe('404 Page Support with _app', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  const gip404Err =
    /`pages\/404` can not have getInitialProps\/getServerSideProps/

  if (isNextStart) {
    it('should build successfully', async () => {
      expect(next.cliOutput).toContain('Compiled successfully')
      expect(next.cliOutput).not.toMatch(gip404Err)
      expect(next.cliOutput).not.toContain('Build error occurred')
    })

    it('should not output static 404 if _app has getInitialProps', async () => {
      const browser = await next.browser('/404')
      const isAutoExported = await browser.eval('__NEXT_DATA__.autoExport')
      expect(isAutoExported).toBeFalsy()
    })

    it('specify to use the 404 page still in the routes-manifest', async () => {
      const manifest = await next.readJSON('.next/routes-manifest.json')
      expect(manifest.pages404).toBe(true)
    })
  }

  it('should still use 404 page', async () => {
    const $ = await next.render$('/abc')
    expect($('#404-title').text()).toBe('Hi There')
    const res = await next.fetch('/abc')
    expect(res.status).toBe(404)
  })

  it('should not show pages/404 GIP error', async () => {
    const res = await next.fetch('/abc')
    expect(res.status).toBe(404)
    const $ = await next.render$('/abc')
    expect($('#404-title').text()).toBe('Hi There')
    expect(next.cliOutput).not.toMatch(gip404Err)
    expect(next.cliOutput).not.toContain('Build error occurred')
  })
})
