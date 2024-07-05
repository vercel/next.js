import { nextTestSetup } from 'e2e-utils'
import { check } from 'next-test-utils'

describe('typed-env-pages', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should have env types from next config', async () => {
    const envDts = await next.readFile('.next/types/env.d.ts')

    // do not include from production-specific env
    expect(envDts).not.toInclude('FROM_PROD_ENV_LOCAL: readonly string')

    expect(envDts).toBe(`// Type definitions for Next.js environment variables
declare global {
  namespace NodeJS {
    interface ProcessEnv {
      FROM_DEV_ENV_LOCAL: readonly string
      FROM_ENV_LOCAL: readonly string
      FROM_ENV: readonly string
      FROM_NEXT_CONFIG: readonly string
    }
  }
}
export {}`)
  })

  it('should rewrite env types if .env is modified', async () => {
    // env.d.ts is written from original .env
    expect(await next.readFile('.next/types/env.d.ts')).toInclude(
      'FROM_ENV: readonly string'
    )

    // modify .env
    await next.patchFile('.env', 'MODIFIED_ENV="MODIFIED_ENV"')

    // env.d.ts should be rewritten
    expect(
      await check(
        async () => await next.readFile('.next/types/env.d.ts'),
        /MODIFIED_ENV/
      )
    ).toBe(true)

    // original .env content is not in env.d.ts
    expect(await next.readFile('.next/types/env.d.ts')).not.toInclude(
      'FROM_ENV: readonly string'
    )
  })
})
