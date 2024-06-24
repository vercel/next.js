import { nextTestSetup } from 'e2e-utils'

describe('type-env', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should have env.d.ts file', async () => {
    expect((await next.readFile('.next/types/env.d.ts')).includes('foo')).toBe(
      true
    )
  })
})
