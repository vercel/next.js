import { nextTestSetup, isNextDev, isNextStart } from 'e2e-utils'
;((isNextDev && process.env.TURBOPACK_BUILD) ||
  (isNextStart && process.env.TURBOPACK_DEV)
  ? describe.skip
  : describe)('pageProps GSSP conflict', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should merge _app pageProps and getServerSideProps props', async () => {
    const $ = await next.render$('/gssp')
    expect(JSON.parse($('p').text())).toEqual({ hi: 'hi', hello: 'world' })
  })

  it('should merge _app pageProps and getStaticProps props', async () => {
    const $ = await next.render$('/gsp')
    expect(JSON.parse($('p').text())).toEqual({ hi: 'hi', hello: 'world' })
  })
})
