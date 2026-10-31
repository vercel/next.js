import { nextTestSetup } from 'e2e-utils'
import { gate } from 'next-test-utils'

describe('future-compat', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('serves requests without deprecated APIs', async () => {
    const response = await next.fetch('/')
    expect(response.status).toBe(200)
    expect(await response.text()).toContain('hello world')
  })

  it('throws on deprecated Node.js APIs only in future compatibility mode', async () => {
    const response = await next.fetch('/deprecated')
    if (await gate((conditions) => conditions.futureCompat)) {
      expect(response.status).toBe(500)
      const error = await response.text()
      expect(error).toContain('DEP0005')
      expect(error).toContain('Buffer() is deprecated')
    } else {
      expect(response.status).toBe(200)
      expect(await response.text()).toBe('future-compat')
    }
  })
})
