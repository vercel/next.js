import { nextTestSetup } from 'e2e-utils'

describe('app-dir - patched-fetch', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should return string fetch for fetch.name in server component', async () => {
    const $ = await next.render$('/server-component')
    const fetchName = $('#fetch-function-name').text()
    expect(fetchName).toBe('fetch')
  })

  it('should return string fetch for fetch.name in client component', async () => {
    const $ = await next.render$('/client-component')
    const fetchName = $('#fetch-function-name').text()
    expect(fetchName).toBe('fetch')
  })
})
