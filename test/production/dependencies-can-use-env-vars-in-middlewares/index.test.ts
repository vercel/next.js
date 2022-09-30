import { createNext } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'
import { fetchViaHTTP } from 'next-test-utils'
import { readJson } from 'fs-extra'
import path from 'path'

describe('dependencies can use env vars in middlewares', () => {
  let next: NextInstance

  beforeAll(() => {
    process.env.MY_CUSTOM_PACKAGE_ENV_VAR = 'my-custom-package-env-var'
    process.env.ENV_VAR_USED_IN_MIDDLEWARE = 'env-var-used-in-middleware'
  })

  beforeAll(async () => {
    next = await createNext({
      files: {
        // A 3rd party dependency
        'node_modules/my-custom-package/package.json': JSON.stringify({
          name: 'my-custom-package',
          version: '1.0.0',
          browser: 'index.js',
        }),
        'node_modules/my-custom-package/index.js': `
          module.exports = () => process.env.MY_CUSTOM_PACKAGE_ENV_VAR;
        `,

        'pages/index.js': `
          export default function () { return <div>Hello, world!</div> }
        `,

        'middleware.js': `
          import customPackage from 'my-custom-package';
          export default function middleware(_req) {
            return new Response(null, { 
              headers: { 
                data: JSON.stringify({
                  string: "a constant string",
                  hello: process.env.ENV_VAR_USED_IN_MIDDLEWARE,
                  customPackage: customPackage(),
                })
              }
            })
          }
        `,
        // make sure invalid package-lock doesn't error
        'package-lock.json': '{}',
      },
      dependencies: {},
    })
  })
  afterAll(() => next.destroy())

  it('does not error from patching lockfile', () => {
    expect(next.cliOutput).not.toContain('patch-incorrect-lockfile')
  })

  it('parses the env vars correctly', async () => {
    const testDir = next.testDir
    const manifestPath = path.join(
      testDir,
      '.next/server/middleware-manifest.json'
    )
    const manifest = await readJson(manifestPath)
    const envVars = manifest?.middleware?.['/']?.env

    expect(envVars).toHaveLength(2)
    expect(envVars).toContain('ENV_VAR_USED_IN_MIDDLEWARE')
    expect(envVars).toContain('MY_CUSTOM_PACKAGE_ENV_VAR')
  })

  it('uses the environment variables', async () => {
    const response = await fetchViaHTTP(next.url, '/api')
    expect(JSON.parse(response.headers.get('data'))).toEqual({
      string: 'a constant string',
      hello: 'env-var-used-in-middleware',
      customPackage: 'my-custom-package-env-var',
    })
  })
})
