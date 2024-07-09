import { nextTestSetup } from 'e2e-utils'
import { check } from 'next-test-utils'

describe('typed-env-pages', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should have env types from next config', async () => {
    await check(
      async () => {
        return await next.readFile('.next/types/env.d.ts')
      },

      // should not include from production-specific env
      // e.g. FROM_PROD_ENV_LOCAL: readonly string
      `// Type definitions for Next.js environment variables
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
export {}`
    )
  })

  it('should rewrite env types if .env is modified', async () => {
    await check(
      async () => {
        return await next.readFile('.next/types/env.d.ts')
      },
      // env.d.ts is written from original .env
      /FROM_ENV: readonly string/
    )

    // modify .env
    await next.patchFile('.env', 'MODIFIED_ENV="MODIFIED_ENV"')

    // should not include from original .env
    // e.g. FROM_ENV: readonly string
    // but have MODIFIED_ENV: readonly string
    await check(
      async () => {
        return await next.readFile('.next/types/env.d.ts')
      },
      `// Type definitions for Next.js environment variables
declare global {
  namespace NodeJS {
    interface ProcessEnv {
      FROM_DEV_ENV_LOCAL: readonly string
      FROM_ENV_LOCAL: readonly string
      MODIFIED_ENV: readonly string
      FROM_NEXT_CONFIG: readonly string
    }
  }
}
export {}`
    )
  })
})
