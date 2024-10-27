import { createEnvDefinitions } from './create-env-definitions'

describe('create-env-definitions', () => {
  it('should create env definitions', async () => {
    const env = {
      FROM_DEV_ENV_LOCAL: 'FROM_DEV_ENV_LOCAL',
      FROM_ENV_LOCAL: 'FROM_ENV_LOCAL',
      FROM_ENV: 'FROM_ENV',
      FROM_NEXT_CONFIG: 'FROM_NEXT_CONFIG',
    }
    const definitionStr = await createEnvDefinitions({
      distDir: '/dist',
      env,
    })
    expect(definitionStr).toMatchInlineSnapshot(`
      "// Type definitions for Next.js environment variables
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
      export {}"
    `)
  })

  it('should allow empty env', async () => {
    const definitionStr = await createEnvDefinitions({
      distDir: '/dist',
      env: {},
    })
    expect(definitionStr).toMatchInlineSnapshot(`
      "// Type definitions for Next.js environment variables
      declare global {
        namespace NodeJS {
          interface ProcessEnv {

          }
        }
      }
      export {}"
    `)
  })
})
