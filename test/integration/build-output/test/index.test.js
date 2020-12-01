/* eslint-env jest */

import 'flat-map-polyfill'
import { remove } from 'fs-extra'
import { nextBuild } from 'next-test-utils'
import { join } from 'path'
import { recursiveReadDir } from 'next/dist/lib/recursive-readdir'

jest.setTimeout(1000 * 60 * 2)

const fixturesDir = join(__dirname, '..', 'fixtures')

describe('Build Output', () => {
  describe('Basic Application Output', () => {
    let stdout
    const appDir = join(fixturesDir, 'basic-app')

    beforeAll(async () => {
      await remove(join(appDir, '.next'))
    })

    it('should not include internal pages', async () => {
      ;({ stdout } = await nextBuild(appDir, [], {
        stdout: true,
      }))

      expect(stdout).toMatch(/\/ [ ]* \d{1,} B/)
      expect(stdout).toMatch(/\+ First Load JS shared by all [ 0-9.]* kB/)
      expect(stdout).toMatch(/ chunks\/main\.[0-9a-z]{6}\.js [ 0-9.]* kB/)
      expect(stdout).toMatch(/ chunks\/framework\.[0-9a-z]{6}\.js [ 0-9. ]* kB/)

      expect(stdout).not.toContain(' /_document')
      expect(stdout).not.toContain(' /_app')
      expect(stdout).not.toContain(' /_error')
      expect(stdout).not.toContain('<buildId>')

      expect(stdout).toContain('○ /')
    })

    it('should not deviate from snapshot', async () => {
      console.log(stdout)

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

      // should be no bigger than 265 bytes
      expect(parseFloat(indexSize) - 266).toBeLessThanOrEqual(0)
      expect(indexSize.endsWith('B')).toBe(true)

      // should be no bigger than 61.8 kb
      expect(parseFloat(indexFirstLoad) - 62).toBeLessThanOrEqual(0)
      expect(indexFirstLoad.endsWith('kB')).toBe(true)

      expect(parseFloat(err404Size) - 3.6).toBeLessThanOrEqual(0)
      expect(err404Size.endsWith('kB')).toBe(true)

      expect(parseFloat(err404FirstLoad) - 65.1).toBeLessThanOrEqual(0)
      expect(err404FirstLoad.endsWith('kB')).toBe(true)

      expect(parseFloat(sharedByAll) - 61.7).toBeLessThanOrEqual(0)
      expect(sharedByAll.endsWith('kB')).toBe(true)

      if (_appSize.endsWith('kB')) {
        expect(parseFloat(_appSize)).toBeLessThanOrEqual(1.02)
        expect(_appSize.endsWith('kB')).toBe(true)
      } else {
        expect(parseFloat(_appSize) - 1000).toBeLessThanOrEqual(0)
        expect(_appSize.endsWith(' B')).toBe(true)
      }

      expect(parseFloat(webpackSize) - 753).toBeLessThanOrEqual(0)
      expect(webpackSize.endsWith(' B')).toBe(true)

      expect(parseFloat(mainSize) - 7.3).toBeLessThanOrEqual(0)
      expect(mainSize.endsWith('kB')).toBe(true)

      expect(parseFloat(frameworkSize) - 42).toBeLessThanOrEqual(0)
      expect(frameworkSize.endsWith('kB')).toBe(true)
    })

    it('should not emit extracted comments', async () => {
      const files = await recursiveReadDir(
        join(appDir, '.next'),
        /\.txt|\.LICENSE\./
      )
      expect(files).toEqual([])
    })
  })

  describe('Crypto Application', () => {
    let stdout
    const appDir = join(fixturesDir, 'with-crypto')

    beforeAll(async () => {
      await remove(join(appDir, '.next'))
    })

    it('should not include crypto', async () => {
      ;({ stdout } = await nextBuild(appDir, [], {
        stdout: true,
      }))

      console.log(stdout)

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

      const indexSize = parsePageSize('/')
      const indexFirstLoad = parsePageFirstLoad('/')

      expect(parseFloat(indexSize)).toBeLessThanOrEqual(3)
      expect(parseFloat(indexSize)).toBeGreaterThanOrEqual(2)
      expect(indexSize.endsWith('kB')).toBe(true)

      expect(parseFloat(indexFirstLoad)).toBeLessThanOrEqual(65)
      expect(parseFloat(indexFirstLoad)).toBeGreaterThanOrEqual(60)
      expect(indexFirstLoad.endsWith('kB')).toBe(true)
    })
  })

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
