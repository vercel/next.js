import { nextTestSetup } from 'e2e-utils'

describe('build-cache-handlers', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
  })

  const expectedHandler = isNextDev ? 'runtime' : 'build'

  it('uses build overrides for prerendering except in development', async () => {
    const $ = await next.render$('/')
    expect($('#handler').text()).toBe(expectedHandler)
    expect($('#fallback').text()).toBe('fallback')
  })

  it('uses build overrides in generateStaticParams', async () => {
    const $ = await next.render$(`/params/${expectedHandler}`)
    expect($('p').text()).toBe(expectedHandler)
  })

  it('uses runtime handlers for requests', async () => {
    const response = await next.fetch('/runtime?key=runtime-only')
    expect(await response.json()).toEqual({
      key: '?key=runtime-only',
      handler: 'runtime',
    })
  })
})
