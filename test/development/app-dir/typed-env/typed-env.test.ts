import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('typed-env', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should have env types from next config', async () => {
    await retry(async () => {
      const envDTS = await next.readFile(`${next.distDir}/types/env.d.ts`)
      // since NODE_ENV is development, env types will
      // not include production-specific env
      expect(envDTS).not.toContain('FROM_ENV_PROD')
      expect(envDTS).not.toContain('FROM_ENV_PROD_LOCAL')

      expect(envDTS).toMatchInlineSnapshot(`
        "// Type definitions for Next.js environment variables
        declare global {
          namespace NodeJS {
            interface ProcessEnv {
              /** Loaded from \`.env.development.local\` */
              FROM_ENV_DEV_LOCAL?: string
              /** Loaded from \`.env.local\` */
              FROM_ENV_LOCAL?: string
              /** Loaded from \`.env.development\` */
              FROM_ENV_DEV?: string
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

  it('should rewrite env types if .env is modified', async () => {
    await retry(async () => {
      const content = await next.readFile(`${next.distDir}/types/env.d.ts`)
      expect(content).toContain('FROM_ENV')
    })

    // modify .env
    await next.patchFile('.env', 'MODIFIED_ENV="MODIFIED_ENV"')

    // should not include from original .env
    // e.g. FROM_ENV?: string
    // but have MODIFIED_ENV?: string
    await retry(async () => {
      const content = await next.readFile(`${next.distDir}/types/env.d.ts`)
      expect(content).toMatchInlineSnapshot(`
        "// Type definitions for Next.js environment variables
        declare global {
          namespace NodeJS {
            interface ProcessEnv {
              /** Loaded from \`.env.development.local\` */
              FROM_ENV_DEV_LOCAL?: string
              /** Loaded from \`.env.local\` */
              FROM_ENV_LOCAL?: string
              /** Loaded from \`.env.development\` */
              FROM_ENV_DEV?: string
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
