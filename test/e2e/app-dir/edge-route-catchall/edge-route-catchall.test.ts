import { nextTestSetup } from 'e2e-utils'

describe('edge-route-catchall', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should correctly normalize edge route catch-all with a single param', async () => {
    const result = await next.fetch('/edge/one')

    expect(await result.text()).toBe(JSON.stringify({ slug: ['one'] }))
  })

  it('should correctly normalize edge route catch-all with multiple params', async () => {
    const result = await next.fetch('/edge/one/two/three')

    expect(await result.text()).toBe(
      JSON.stringify({ slug: ['one', 'two', 'three'] })
    )
  })
})
