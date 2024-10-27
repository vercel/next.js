import { nextTestSetup } from 'e2e-utils'

describe('app-only-flag', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    buildCommand: 'pnpm next build --experimental-app-only',
  })

  it('should serve app route', async () => {
    const $ = await next.render$('/')
    expect($('p').text()).toBe('hello world')
  })

  it('should not serve about route', async () => {
    const res = await next.fetch('/about')
    expect(res.status).toBe(404)
  })
})
