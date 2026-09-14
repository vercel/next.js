import { nextTestSetup, isNextDev, isNextStart } from 'e2e-utils'
;((isNextDev && process.env.TURBOPACK_BUILD) ||
  (isNextStart && process.env.TURBOPACK_DEV)
  ? describe.skip
  : describe)('getInitialProps', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should have gip in __NEXT_DATA__', async () => {
    const $ = await next.render$('/')
    expect(JSON.parse($('#__NEXT_DATA__').text()).gip).toBe(true)
  })

  it('should not have gip in __NEXT_DATA__ for non-GIP page', async () => {
    const $ = await next.render$('/normal')
    expect('gip' in JSON.parse($('#__NEXT_DATA__').text())).toBe(false)
  })

  it('should have correct router.asPath for direct visit dynamic page', async () => {
    const $ = await next.render$('/blog/1')
    expect($('#as-path').text()).toBe('/blog/1')
  })

  it('should have correct router.asPath for direct visit dynamic page rewrite direct', async () => {
    const $ = await next.render$('/blog/post/1')
    expect($('#as-path').text()).toBe('/blog/post/1')
  })
})
