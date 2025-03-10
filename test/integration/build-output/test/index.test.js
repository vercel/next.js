/* eslint-env jest */

import { remove } from 'fs-extra'
import { nextBuild, File } from 'next-test-utils'
import { join } from 'path'
import { recursiveReadDir } from 'next/dist/lib/recursive-readdir'

const fixturesDir = join(__dirname, '..', 'fixtures')

const nextConfig = new File(join(fixturesDir, 'basic-app/next.config.js'))

describe('Build Output', () => {
  ;(process.env.TURBOPACK_DEV ? describe.skip : describe)(
    'production mode',
    () => {
      const configs = [{}, { gzipSize: false }]

      for (const experimental of configs) {
        describe(`Basic Application Output (experimental: ${JSON.stringify(
          experimental
        )})`, () => {
          let stdout
          const appDir = join(fixturesDir, 'basic-app')

          const hasExperimentalConfig = Object.keys(experimental).length > 0

          beforeAll(async () => {
            await remove(join(appDir, '.next'))
            if (hasExperimentalConfig) {
              nextConfig.write(
                `module.exports = { experimental: ${JSON.stringify(
                  experimental
                )} };`
              )
            }
            ;({ stdout } = await nextBuild(appDir, [], {
              stdout: true,
            }))
          })

          if (hasExperimentalConfig) {
            afterAll(async () => {
              nextConfig.delete()
            })
          }

          it('should not include internal pages', async () => {
            expect(stdout).toMatch(/\/ (.* )?\d{1,} k?B/)
            expect(stdout).toMatch(/\+ First Load JS shared by all [ 0-9.]* kB/)
            expect(stdout).toMatch(/ chunks\/.*\.js [ 0-9.]* kB/)
            expect(stdout).toMatch(/ chunks\/.*\.js [ 0-9. ]* kB/)

            expect(stdout).not.toContain(' /_document')
            expect(stdout).not.toContain(' /_app')
            expect(stdout).not.toContain(' /_error')
            expect(stdout).not.toContain('<buildId>')

            expect(stdout).toContain('○ /')
          })

          // TODO: change format of this test to be more reliable
          it.skip('should not deviate from snapshot', async () => {
            console.log(stdout)

            if (process.env.NEXT_PRIVATE_SKIP_SIZE_TESTS) {
              return
            }

            const parsePageSize = (page) =>
              stdout.match(
                new RegExp(` ${page} .*?((?:\\d|\\.){1,} (?:\\w{1,})) `)
              )[1]

            const parsePageFirstLoad = (page) =>
              stdout.match(
                new RegExp(
                  ` ${page} .*?(?:(?:\\d|\\.){1,}) .*? ((?:\\d|\\.){1,} (?:\\w{1,}))`
                )
              )[1]

            const parseSharedSize = (sharedPartName) => {
              const matches = stdout.match(
                new RegExp(
                  `${sharedPartName} .*? ((?:\\d|\\.){1,} (?:\\w{1,}))`
                )
              )

              if (!matches) {
                throw new Error(`Could not match ${sharedPartName}`)
              }

              return matches[1]
            }

            const indexSize = parsePageSize('/')
            const indexFirstLoad = parsePageFirstLoad('/')

            const err404Size = parsePageSize('/404')
            const err404FirstLoad = parsePageFirstLoad('/404')

            const sharedByAll = parseSharedSize('shared by all')
            const _appSize = parseSharedSize('_app-.*?\\.js')
            const webpackSize = parseSharedSize('webpack-.*?\\.js')
            const mainSize = parseSharedSize('main-.*?\\.js')
            const frameworkSize = parseSharedSize('framework-.*?\\.js')

            for (const size of [
              indexSize,
              indexFirstLoad,
              err404Size,
              err404FirstLoad,
              sharedByAll,
              _appSize,
              webpackSize,
              mainSize,
              frameworkSize,
            ]) {
              expect(parseFloat(size)).toBeGreaterThan(0)
            }

            // const gz = experimental.gzipSize !== false

            // expect(parseFloat(indexSize) / 1000).toBeCloseTo(
            //   gz ? 0.251 : 0.394,
            //   2
            // )
            expect(indexSize.endsWith('B')).toBe(true)

            // expect(parseFloat(indexFirstLoad)).toBeCloseTo(gz ? 64 : 196, 1)
            expect(indexFirstLoad.endsWith('kB')).toBe(true)

            // expect(parseFloat(err404Size)).toBeCloseTo(gz ? 3.17 : 8.51, 1)
            expect(err404Size.endsWith('B')).toBe(true)

            // expect(parseFloat(err404FirstLoad)).toBeCloseTo(gz ? 66.9 : 204, 1)
            expect(err404FirstLoad.endsWith('kB')).toBe(true)

            // expect(parseFloat(sharedByAll)).toBeCloseTo(gz ? 63.7 : 196, 1)
            expect(sharedByAll.endsWith('kB')).toBe(true)

            // const appSizeValue = _appSize.endsWith('kB')
            //   ? parseFloat(_appSize)
            //   : parseFloat(_appSize) / 1000
            // expect(appSizeValue).toBeCloseTo(gz ? 0.799 : 1.63, 1)
            expect(_appSize.endsWith('kB') || _appSize.endsWith(' B')).toBe(
              true
            )

            // const webpackSizeValue = webpackSize.endsWith('kB')
            //   ? parseFloat(webpackSize)
            //   : parseFloat(webpackSize) / 1000
            // expect(webpackSizeValue).toBeCloseTo(gz ? 0.766 : 1.46, 2)
            expect(
              webpackSize.endsWith('kB') || webpackSize.endsWith(' B')
            ).toBe(true)

            // expect(parseFloat(mainSize)).toBeCloseTo(gz ? 20.1 : 62.7, 1)
            expect(mainSize.endsWith('kB')).toBe(true)

            // expect(parseFloat(frameworkSize)).toBeCloseTo(gz ? 42.0 : 130, 1)
            expect(frameworkSize.endsWith('kB')).toBe(true)
          })

          it('should print duration when rendering or get static props takes long', () => {
            const matches = stdout.match(
              / \/slow-static\/.+\/.+(?: \(\d+ ms\))?| \[\+\d+ more paths\]/g
            )

            for (const check of [
              // summary
              expect.stringMatching(
                /\/\[propsDuration\]\/\[renderDuration\] \(\d+ ms\)/
              ),
              // ordered by duration, includes duration
              expect.stringMatching(/\/2000\/10 \(\d+ ms\)$/),
              expect.stringMatching(/\/10\/1000 \(\d+ ms\)$/),
              expect.stringMatching(/\/300\/10 \(\d+ ms\)$/),
              // max of 7 preview paths
              ' [+2 more paths]',
            ]) {
              // the order isn't guaranteed on the timing tests as while() is being
              // used in the render so can block the thread of other renders sharing
              // the same worker
              expect(matches).toContainEqual(check)
            }
          })

          it('should not emit extracted comments', async () => {
            const files = await recursiveReadDir(join(appDir, '.next'), {
              pathnameFilter: (f) => /\.txt|\.LICENSE\./.test(f),
            })
            expect(files).toEqual([])
          })
        })
      }

      describe('Custom App Output', () => {
        const appDir = join(fixturesDir, 'with-app')

        beforeAll(async () => {
          await remove(join(appDir, '.next'))
        })

        it('should not include custom error', async () => {
          const { stdout } = await nextBuild(appDir, [], {
            stdout: true,
          })

          expect(stdout).toMatch(/\/ (.* )?\d{1,} k?B/)
          expect(stdout).toMatch(/\/_app (.* )?\d{1,} k?B/)
          expect(stdout).toMatch(/\+ First Load JS shared by all \s*[0-9.]+ kB/)
          expect(stdout).toMatch(/ chunks\/.*\.js \s*[0-9.]+ kB/)

          expect(stdout).not.toContain(' /_document')
          expect(stdout).not.toContain(' /_error')
          expect(stdout).not.toContain('<buildId>')

          expect(stdout).toContain(' /_app')
          expect(stdout).toContain('○ /')
        })
      })

      // AMP is not supported with Turbopack.
      ;(process.env.TURBOPACK ? describe.skip : describe)(
        'With AMP Output',
        () => {
          const appDir = join(fixturesDir, 'with-amp')

          beforeAll(async () => {
            await remove(join(appDir, '.next'))
          })

          it('should not include custom error', async () => {
            const { stdout } = await nextBuild(appDir, [], {
              stdout: true,
            })

            expect(stdout).toMatch(/\/ (.* )?[0-9.]+ k?B \s*[0-9.]+ kB/)
            expect(stdout).toMatch(/\/amp (.* )?AMP/)
            expect(stdout).toMatch(/\/hybrid (.* )?[0-9.]+ k?B/)
            expect(stdout).toMatch(
              /\+ First Load JS shared by all \s*[0-9.]+ kB/
            )
            expect(stdout).toMatch(/ chunks\/.*\.js \s*[0-9.]+ kB/)

            expect(stdout).not.toContain(' /_document')
            expect(stdout).not.toContain(' /_error')
            expect(stdout).not.toContain('<buildId>')

            expect(stdout).toContain('○ /')
          })
        }
      )

      describe('Custom Error Output', () => {
        const appDir = join(fixturesDir, 'with-error')

        beforeAll(async () => {
          await remove(join(appDir, '.next'))
        })

        it('should not include custom app', async () => {
          const { stdout } = await nextBuild(appDir, [], {
            stdout: true,
          })

          expect(stdout).toMatch(/\/ (.* )?\d{1,} k?B/)
          expect(stdout).toMatch(/ƒ \/404 (.* )?\d{1,} k?B/)
          expect(stdout).toMatch(/\+ First Load JS shared by all [ 0-9.]* kB/)
          expect(stdout).toMatch(/ chunks\/.*\.js [ 0-9.]* kB/)

          expect(stdout).not.toContain(' /_document')
          expect(stdout).not.toContain(' /_app')
          expect(stdout).not.toContain('<buildId>')

          expect(stdout).not.toContain(' /_error')
          expect(stdout).toContain('○ /')
        })
      })

      describe('Custom Static Error Output', () => {
        const appDir = join(fixturesDir, 'with-error-static')

        beforeAll(async () => {
          await remove(join(appDir, '.next'))
        })

        it('should not specify /404 as lambda when static', async () => {
          const { stdout } = await nextBuild(appDir, [], {
            stdout: true,
          })
          expect(stdout).toContain('○ /404')
          expect(stdout).not.toContain('ƒ /_error')
          expect(stdout).not.toContain('<buildId>')
        })
      })

      describe('With Parallel Routes', () => {
        it('should not have duplicate paths that resolve to the same route', async () => {
          const appDir = join(fixturesDir, 'with-parallel-routes')

          const { stdout } = await nextBuild(appDir, [], {
            stdout: true,
          })

          expect(stdout.match(/○ \/root-page /g).length).toBe(1)
        })
      })
    }
  )
})
