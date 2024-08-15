/* eslint-env jest */

import { join } from 'path'
import { nextBuild, File } from 'next-test-utils'

const appDir = join(__dirname, '..')
const nextConfigFile = new File(join(appDir, 'next.config.js'))
const tsConfigFile = new File(join(appDir, 'tsconfig.json'))

describe('TypeScript with error handling options', () => {
  // Dev can no longer show errors (for now), logbox will cover this in the
  // future.
  ;(process.env.TURBOPACK_DEV ? describe.skip : describe)(
    'production mode',
    () => {
      for (const incremental of [false, true]) {
        for (const ignoreBuildErrors of [false, true]) {
          describe(`ignoreBuildErrors: ${ignoreBuildErrors}`, () => {
            beforeAll(() => {
              const nextConfig = {
                typescript: { ignoreBuildErrors },
              }
              nextConfigFile.write(
                'module.exports = ' + JSON.stringify(nextConfig)
              )
              const tsconfig = JSON.parse(tsConfigFile.originalContent)
              tsConfigFile.write(
                JSON.stringify(
                  {
                    ...tsconfig,
                    compilerOptions: {
                      ...tsconfig.compilerOptions,
                      incremental,
                    },
                  },
                  null,
                  2
                )
              )
            })
            afterAll(() => {
              nextConfigFile.restore()
              tsConfigFile.restore()
            })

            it(
              (ignoreBuildErrors
                ? 'Next builds the application despite type errors'
                : 'Next fails to build the application despite type errors') +
                (incremental
                  ? ' in incremental mode'
                  : ' without incremental mode'),
              async () => {
                const { stdout, stderr } = await nextBuild(appDir, [], {
                  stdout: true,
                  stderr: true,
                })

                if (ignoreBuildErrors) {
                  expect(stdout).toContain('Compiled successfully')
                  expect(stderr).not.toContain('Failed to compile.')
                  expect(stderr).not.toContain(
                    "not assignable to type 'boolean'"
                  )
                } else {
                  expect(stdout).not.toContain('Compiled successfully')
                  expect(stderr).toContain('Failed to compile.')
                  expect(stderr).toContain('./pages/index.tsx:2:31')
                  expect(stderr).toContain("not assignable to type 'boolean'")
                }
              }
            )
          })
        }
      }
    }
  )
})
