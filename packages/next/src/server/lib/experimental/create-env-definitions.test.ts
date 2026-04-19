import { createEnvDefinitions } from './create-env-definitions'

describe('create-env-definitions', () => {
  it('should create env definitions', async () => {
    const loadedEnvFiles = [
      {
        path: '.env.local',
        contents: '',
        env: {
          FROM_ENV_LOCAL: 'FROM_ENV_LOCAL',
        },
      },
      {
        path: '.env.development.local',
        contents: '',
        env: {
          FROM_ENV_DEV_LOCAL: 'FROM_ENV_DEV_LOCAL',
        },
      },
      {
        path: 'next.config.js',
        contents: '',
        env: {
          FROM_NEXT_CONFIG: 'FROM_NEXT_CONFIG',
        },
      },
    ]
    const definitionStr = await createEnvDefinitions({
      distDir: '/dist',
      loadedEnvFiles,
    })
    expect(definitionStr).toMatchInlineSnapshot(`
      "// Type definitions for Next.js environment variables
      declare global {
        namespace NodeJS {
          interface ProcessEnv {
            /** Loaded from \`.env.local\` */
            FROM_ENV_LOCAL?: string
            /** Loaded from \`.env.development.local\` */
            FROM_ENV_DEV_LOCAL?: string
            /** Loaded from \`next.config.js\` */
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
      loadedEnvFiles: [],
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

  it('should dedupe env definitions in order of priority', async () => {
    const loadedEnvFiles = [
      {
        path: '.env.local',
        contents: '',
        env: {
          DUPLICATE_ENV: 'DUPLICATE_ENV',
        },
      },
      {
        path: '.env.development.local',
        contents: '',
        env: {
          DUPLICATE_ENV: 'DUPLICATE_ENV',
        },
      },
      {
        path: 'next.config.js',
        contents: '',
        env: {
          DUPLICATE_ENV: 'DUPLICATE_ENV',
        },
      },
    ]
    const definitionStr = await createEnvDefinitions({
      distDir: '/dist',
      loadedEnvFiles,
    })
    expect(definitionStr).toMatchInlineSnapshot(`
      "// Type definitions for Next.js environment variables
      declare global {
        namespace NodeJS {
          interface ProcessEnv {
            /** Loaded from \`.env.local\` */
            DUPLICATE_ENV?: string
          }
        }
      }
      export {}"
    `)
  })
})
