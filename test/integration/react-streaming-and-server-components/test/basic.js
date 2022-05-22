import { renderViaHTTP } from 'next-test-utils'

export default async function basic(context, { env }) {
  it('should render 500 error correctly', async () => {
    const errPaths = ['/err', '/err/render']
    const promises = errPaths.map(async (pagePath) => {
      const html = await renderViaHTTP(context.appPort, pagePath)
      if (env === 'dev') {
        // In dev mode it should show the error popup.
        expect(html).toContain('Error: oops')
      } else {
        expect(html).toContain('custom-500-page')
      }
    })
    await Promise.all(promises)
  })

  it('should render fallback if error raised from suspense during streaming', async () => {
    const html = await renderViaHTTP(context.appPort, '/err/suspense')
    expect(html).toContain('error-fallback')
  })
}
