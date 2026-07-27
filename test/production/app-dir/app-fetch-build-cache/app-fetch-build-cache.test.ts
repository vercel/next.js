import { nextTestSetup } from 'e2e-utils'

describe('app fetch build cache', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  let initialData

  it('should have done initial build', async () => {
    const $ = await next.render$('/')
    expect($('#page').text()).toBe('index page')

    initialData = $('#data').text()
    expect(initialData).toBeTruthy()
  })

  it('should not use stale data if present', async () => {
    await next.stop()

    next.env['NOW_BUILDER'] = '1'
    await next.start()

    const $ = await next.render$('/')
    expect($('#page').text()).toBe('index page')

    const newData = $('#data').text()
    expect(newData).toBeTruthy()
    expect(newData).not.toBe(initialData)
  })
})
