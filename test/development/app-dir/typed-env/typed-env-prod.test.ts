import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('typed-env', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    env: {
      NODE_ENV: 'production',
    },
  })

  it('should have env types from next config', async () => {
    await retry(async () => {
      const envDTS = await next.readFile(`${next.distDir}/types/env.d.ts`)
      // since NODE_ENV is production, env types will
      // not include development-specific env
      expect(envDTS).not.toContain('FROM_ENV_DEV')
      expect(envDTS).not.toContain('FROM_ENV_DEV_LOCAL')

      expect(envDTS).toMatchInlineSnapshot(`
        "// Type definitions for Next.js environment variables
        declare global {
          namespace NodeJS {
            interface ProcessEnv {
              /** Loaded from \`.env.production.local\` */
              FROM_ENV_PROD_LOCAL?: string
              /** Loaded from \`.env.local\` */
              FROM_ENV_LOCAL?: string
              /** Loaded from \`.env.production\` */
              FROM_ENV_PROD?: string
              /** Loaded from \`.env\` */
              FROM_ENV?: string
              /** Loaded from \`next.config.js\` */
              FROM_NEXT_CONFIG?: string
            }
          }
        }
        export {}"
      `)
    })
  })

  // TODO: test for deleting .env & updating env.d.ts
})
