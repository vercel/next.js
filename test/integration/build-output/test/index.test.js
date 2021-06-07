/* eslint-env jest */

import 'flat-map-polyfill'
import { remove } from 'fs-extra'
import { nextBuild, File } from 'next-test-utils'
import { join } from 'path'
import { recursiveReadDir } from 'next/dist/lib/recursive-readdir'

jest.setTimeout(1000 * 60 * 2)

const fixturesDir = join(__dirname, '..', 'fixtures')

const nextConfig = new File(join(fixturesDir, 'basic-app/next.config.js'))

describe('Build Output', () => {
  for (const gzipSize of [true, false, undefined]) {
    describe(
      'Basic Application Output' +
        (gzipSize !== undefined
          ? ` (with experimental.gzipSize: ${gzipSize})`
          : ''),
      () => {
        let stdout
        const appDir = join(fixturesDir, 'basic-app')

        beforeAll(async () => {
          await remove(join(appDir, '.next'))
          if (gzipSize !== undefined) {
            nextConfig.write(
              `module.exports = { experimental: { gzipSize: ${gzipSize} } };`
            )
          }
        })

        if (gzipSize !== undefined) {
          afterAll(async () => {
            nextConfig.delete()
          })
        }

        it('should not include internal pages', async () => {
          ;({ stdout } = await nextBuild(appDir, [], {
            stdout: true,
          }))

          expect(stdout).toMatch(/\/ [ ]* \d{1,} B/)
          expect(stdout).toMatch(/\+ First Load JS shared by all [ 0-9.]* kB/)
          expect(stdout).toMatch(/ chunks\/main\.[0-9a-z]{6}\.js [ 0-9.]* kB/)
          expect(stdout).toMatch(
            / chunks\/framework\.[0-9a-z]{6}\.js [ 0-9. ]* kB/
          )

          expect(stdout).not.toContain(' /_document')
          expect(stdout).not.toContain(' /_app')
          expect(stdout).not.toContain(' /_error')
          expect(stdout).not.toContain('<buildId>')

          expect(stdout).toContain('○ /')
        })

        it('should not deviate from snapshot', async () => {
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
              new RegExp(`${sharedPartName} .*? ((?:\\d|\\.){1,} (?:\\w{1,}))`)
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
          const _appSize = parseSharedSize('_app\\..*?\\.js')
          const webpackSize = parseSharedSize('webpack\\..*?\\.js')
          const mainSize = parseSharedSize('main\\..*?\\.js')
          const frameworkSize = parseSharedSize('framework\\..*?\\.js')

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

          const gz = gzipSize !== false

          expect(parseFloat(indexSize) / 1000).toBeCloseTo(
            gz ? 0.251 : 0.394,
            2
          )
          expect(indexSize.endsWith('B')).toBe(true)

          expect(parseFloat(indexFirstLoad)).toBeCloseTo(gz ? 64 : 196, 1)
          expect(indexFirstLoad.endsWith('kB')).toBe(true)

          expect(parseFloat(err404Size)).toBeCloseTo(gz ? 3.06 : 8.15, 1)
          expect(err404Size.endsWith('kB')).toBe(true)

          expect(parseFloat(err404FirstLoad)).toBeCloseTo(gz ? 66.8 : 204, 1)
          expect(err404FirstLoad.endsWith('kB')).toBe(true)

          expect(parseFloat(sharedByAll)).toBeCloseTo(gz ? 63.7 : 196, 1)
          expect(sharedByAll.endsWith('kB')).toBe(true)

          const appSizeValue = _appSize.endsWith('kB')
            ? parseFloat(_appSize)
            : parseFloat(_appSize) / 1000
          expect(appSizeValue).toBeCloseTo(gz ? 0.799 : 1.63, 1)
          expect(_appSize.endsWith('kB') || _appSize.endsWith(' B')).toBe(true)

          const webpackSizeValue = webpackSize.endsWith('kB')
            ? parseFloat(webpackSize)
            : parseFloat(webpackSize) / 1000
          expect(webpackSizeValue).toBeCloseTo(gz ? 0.76 : 1.45, 2)
          expect(webpackSize.endsWith('kB') || webpackSize.endsWith(' B')).toBe(
            true
          )

          expect(parseFloat(mainSize)).toBeCloseTo(gz ? 20.1 : 62.8, 1)
          expect(mainSize.endsWith('kB')).toBe(true)

          expect(parseFloat(frameworkSize)).toBeCloseTo(gz ? 42.0 : 130, 1)
          expect(frameworkSize.endsWith('kB')).toBe(true)
        })

        it('should not emit extracted comments', async () => {
          const files = await recursiveReadDir(
            join(appDir, '.next'),
            /\.txt|\.LICENSE\./
          )
          expect(files).toEqual([])
        })
      }
    )
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

      expect(stdout).toMatch(/\/ [ ]* \d{1,} B/)
      expect(stdout).toMatch(/\/_app [ ]* \d{1,} B/)
      expect(stdout).toMatch(/\+ First Load JS shared by all [ 0-9.]* kB/)
      expect(stdout).toMatch(/ chunks\/main\.[0-9a-z]{6}\.js [ 0-9.]* kB/)
      expect(stdout).toMatch(/ chunks\/framework\.[0-9a-z]{6}\.js [ 0-9. ]* kB/)

      expect(stdout).not.toContain(' /_document')
      expect(stdout).not.toContain(' /_error')
      expect(stdout).not.toContain('<buildId>')

      expect(stdout).toContain(' /_app')
      expect(stdout).toContain('○ /')
    })
  })

  describe('With AMP Output', () => {
    const appDir = join(fixturesDir, 'with-amp')

    beforeAll(async () => {
      await remove(join(appDir, '.next'))
    })

    it('should not include custom error', async () => {
      const { stdout } = await nextBuild(appDir, [], {
        stdout: true,
      })

      expect(stdout).toMatch(/\/ [ 0-9.]* B [ 0-9.]* kB/)
      expect(stdout).toMatch(/\/amp .* AMP/)
      expect(stdout).toMatch(/\/hybrid [ 0-9.]* B/)
      expect(stdout).toMatch(/\+ First Load JS shared by all [ 0-9.]* kB/)
      expect(stdout).toMatch(/ chunks\/main\.[0-9a-z]{6}\.js [ 0-9.]* kB/)
      expect(stdout).toMatch(/ chunks\/framework\.[0-9a-z]{6}\.js [ 0-9. ]* kB/)

      expect(stdout).not.toContain(' /_document')
      expect(stdout).not.toContain(' /_error')
      expect(stdout).not.toContain('<buildId>')

      expect(stdout).toContain('○ /')
    })
  })

  describe('Custom Error Output', () => {
    const appDir = join(fixturesDir, 'with-error')

    beforeAll(async () => {
      await remove(join(appDir, '.next'))
    })

    it('should not include custom app', async () => {
      const { stdout } = await nextBuild(appDir, [], {
        stdout: true,
      })

      expect(stdout).toMatch(/\/ [ ]* \d{1,} B/)
      expect(stdout).toMatch(/λ \/404 [ ]* \d{1,} B/)
      expect(stdout).toMatch(/\+ First Load JS shared by all [ 0-9.]* kB/)
      expect(stdout).toMatch(/ chunks\/main\.[0-9a-z]{6}\.js [ 0-9.]* kB/)
      expect(stdout).toMatch(/ chunks\/framework\.[0-9a-z]{6}\.js [ 0-9. ]* kB/)

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
      expect(stdout).not.toContain('λ /_error')
      expect(stdout).not.toContain('<buildId>')
    })
  })
})
