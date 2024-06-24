import { nextTestSetup } from 'e2e-utils'

describe('type-env', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should have env.d.ts file', async () => {
    expect(await next.hasFile('.next/types/env.d.ts')).toBe(true)
  })

  it('should have env types from development server', async () => {
    expect(await next.readFile('.next/types/env.d.ts'))
      .toBe(`// Type definitions for Next.js environment variables
declare global {
  namespace NodeJS {
    interface ProcessEnv {
      FROM_NEXT_CONFIG: readonly string
      FROM_DEV_ENV_LOCAL: readonly string
      FROM_ENV_LOCAL: readonly string
      FROM_ENV: readonly string
    }
  }
}
export {}`)
  })
})
