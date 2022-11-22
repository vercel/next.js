import { init, next } from './utils'
import { fetchViaHTTP } from 'next-test-utils'

describe('hello-world example', () => {
  init('hello-world')

  it('should show "Hello World"', async () => {
    const res = await fetchViaHTTP(next.url, '/')
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('Hello World')
  })
})
