import { nextTestSetup } from 'e2e-utils'
import { check } from 'next-test-utils'

describe('typed-env', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should have env types from next config', async () => {
    await check(
      async () => {
        return await next.readFile('.next/types/env.d.ts')
      },

      // should not include from production-specific env
      // e.g. FROM_PROD_ENV_LOCAL?: string
      `// Type definitions for Next.js environment variables
declare global {
  namespace NodeJS {
    interface ProcessEnv {
      FROM_DEV_ENV_LOCAL?: string
      FROM_ENV_LOCAL?: string
      FROM_ENV?: string
      FROM_NEXT_CONFIG?: string
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
      /FROM_ENV/
    )

    // modify .env
    await next.patchFile('.env', 'MODIFIED_ENV="MODIFIED_ENV"')

    // should not include from original .env
    // e.g. FROM_ENV?: string
    // but have MODIFIED_ENV?: string
    await check(
      async () => {
        return await next.readFile('.next/types/env.d.ts')
      },
      `// Type definitions for Next.js environment variables
declare global {
  namespace NodeJS {
    interface ProcessEnv {
      FROM_DEV_ENV_LOCAL?: string
      FROM_ENV_LOCAL?: string
      MODIFIED_ENV?: string
      FROM_NEXT_CONFIG?: string
    }
  }
}
export {}`
    )
  })

  // TODO: test for deleting .env & updating env.d.ts
})
