import { nextTestSetup } from 'e2e-utils'
import { join } from 'path'
import fs from 'fs'

describe('Build Output', () => {
  describe('Basic Application Output (default config)', () => {
    const { next } = nextTestSetup({
      files: join(__dirname, 'fixtures', 'basic-app'),
      skipStart: true,
    })

    let stdout: string

    beforeAll(async () => {
      const result = await next.build()
      stdout = result.cliOutput
    })

    it('should not include internal pages', () => {
      expect(stdout).toMatch(/\//)
      expect(stdout).not.toContain(' /_document')
      expect(stdout).not.toContain(' /_app')
      expect(stdout).not.toContain(' /_error')
      expect(stdout).not.toContain('<buildId>')
      expect(stdout).toContain('○ /')
    })

    // TODO: change format of this test to be more reliable
    it.skip('should not deviate from snapshot', () => {
      console.log(stdout)

      if (process.env.NEXT_PRIVATE_SKIP_SIZE_TESTS) {
        return
      }

      const parsePageSize = (page: string) =>
        stdout.match(
          new RegExp(` ${page} .*?((?:\\d|\\.){1,} (?:\\w{1,})) `)
        )![1]

      const parsePageFirstLoad = (page: string) =>
        stdout.match(
          new RegExp(
            ` ${page} .*?(?:(?:\\d|\\.){1,}) .*? ((?:\\d|\\.){1,} (?:\\w{1,}))`
          )
        )![1]

      const parseSharedSize = (sharedPartName: string) => {
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

      expect(indexSize.endsWith('B')).toBe(true)
      expect(indexFirstLoad.endsWith('kB')).toBe(true)
      expect(err404Size.endsWith('B')).toBe(true)
      expect(err404FirstLoad.endsWith('kB')).toBe(true)
      expect(sharedByAll.endsWith('kB')).toBe(true)
      expect(_appSize.endsWith('kB') || _appSize.endsWith(' B')).toBe(true)
      expect(webpackSize.endsWith('kB') || webpackSize.endsWith(' B')).toBe(
        true
      )
      expect(mainSize.endsWith('kB')).toBe(true)
      expect(frameworkSize.endsWith('kB')).toBe(true)
    })

    it('should print duration when rendering or get static props takes long', () => {
      const matches = stdout.match(
        / \/slow-static\/.+\/.+(?: \(\d+ ms\))?| \[\+\d+ more paths\]/g
      )

      for (const check of [
        expect.stringMatching(
          /\/\[propsDuration\]\/\[renderDuration\] \(\d+ ms\)/
        ),
        expect.stringMatching(/\/2000\/10 \(\d+ ms\)$/),
        expect.stringMatching(/\/10\/1000 \(\d+ ms\)$/),
        expect.stringMatching(/\/300\/10 \(\d+ ms\)$/),
        ' [+2 more paths]',
      ]) {
        expect(matches).toContainEqual(check)
      }
    })

    it('should not emit extracted comments', () => {
      const nextDir = join(next.testDir, '.next')
      const allFiles: string[] = []

      function walk(dir: string) {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          const full = join(dir, entry.name)
          if (entry.isDirectory()) walk(full)
          else allFiles.push(full)
        }
      }
      walk(nextDir)

      const txtOrLicenseFiles = allFiles.filter((f) =>
        /\.txt|\.LICENSE\./.test(f)
      )
      expect(txtOrLicenseFiles).toEqual([])
    })
  })

  describe('Basic Application Output (gzipSize: false)', () => {
    const { next } = nextTestSetup({
      files: join(__dirname, 'fixtures', 'basic-app'),
      skipStart: true,
      nextConfig: {
        experimental: {
          gzipSize: false,
        },
      },
    })

    let stdout: string

    beforeAll(async () => {
      const result = await next.build()
      stdout = result.cliOutput
    })

    it('should not include internal pages', () => {
      expect(stdout).toMatch(/\//)
      expect(stdout).not.toContain(' /_document')
      expect(stdout).not.toContain(' /_app')
      expect(stdout).not.toContain(' /_error')
      expect(stdout).not.toContain('<buildId>')
      expect(stdout).toContain('○ /')
    })

    // TODO: change format of this test to be more reliable
    it.skip('should not deviate from snapshot', () => {
      console.log(stdout)

      if (process.env.NEXT_PRIVATE_SKIP_SIZE_TESTS) {
        return
      }

      const parsePageSize = (page: string) =>
        stdout.match(
          new RegExp(` ${page} .*?((?:\\d|\\.){1,} (?:\\w{1,})) `)
        )![1]

      const parsePageFirstLoad = (page: string) =>
        stdout.match(
          new RegExp(
            ` ${page} .*?(?:(?:\\d|\\.){1,}) .*? ((?:\\d|\\.){1,} (?:\\w{1,}))`
          )
        )![1]

      const parseSharedSize = (sharedPartName: string) => {
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

      expect(indexSize.endsWith('B')).toBe(true)
      expect(indexFirstLoad.endsWith('kB')).toBe(true)
      expect(err404Size.endsWith('B')).toBe(true)
      expect(err404FirstLoad.endsWith('kB')).toBe(true)
      expect(sharedByAll.endsWith('kB')).toBe(true)
      expect(_appSize.endsWith('kB') || _appSize.endsWith(' B')).toBe(true)
      expect(webpackSize.endsWith('kB') || webpackSize.endsWith(' B')).toBe(
        true
      )
      expect(mainSize.endsWith('kB')).toBe(true)
      expect(frameworkSize.endsWith('kB')).toBe(true)
    })

    it('should print duration when rendering or get static props takes long', () => {
      const matches = stdout.match(
        / \/slow-static\/.+\/.+(?: \(\d+ ms\))?| \[\+\d+ more paths\]/g
      )

      for (const check of [
        expect.stringMatching(
          /\/\[propsDuration\]\/\[renderDuration\] \(\d+ ms\)/
        ),
        expect.stringMatching(/\/2000\/10 \(\d+ ms\)$/),
        expect.stringMatching(/\/10\/1000 \(\d+ ms\)$/),
        expect.stringMatching(/\/300\/10 \(\d+ ms\)$/),
        ' [+2 more paths]',
      ]) {
        expect(matches).toContainEqual(check)
      }
    })

    it('should not emit extracted comments', () => {
      const nextDir = join(next.testDir, '.next')
      const allFiles: string[] = []

      function walk(dir: string) {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          const full = join(dir, entry.name)
          if (entry.isDirectory()) walk(full)
          else allFiles.push(full)
        }
      }
      walk(nextDir)

      const txtOrLicenseFiles = allFiles.filter((f) =>
        /\.txt|\.LICENSE\./.test(f)
      )
      expect(txtOrLicenseFiles).toEqual([])
    })
  })

  describe('Custom App Output', () => {
    const { next } = nextTestSetup({
      files: join(__dirname, 'fixtures', 'with-app'),
      skipStart: true,
    })

    it('should not include custom error', async () => {
      const { cliOutput: stdout } = await next.build()

      expect(stdout).toMatch(/\//)
      expect(stdout).toMatch(/\/_app/)

      expect(stdout).not.toContain(' /_document')
      expect(stdout).not.toContain(' /_error')
      expect(stdout).not.toContain('<buildId>')

      expect(stdout).toContain(' /_app')
      expect(stdout).toContain('○ /')
    })
  })

  describe('Custom Error Output', () => {
    const { next } = nextTestSetup({
      files: join(__dirname, 'fixtures', 'with-error'),
      skipStart: true,
    })

    it('should not include custom app', async () => {
      const { cliOutput: stdout } = await next.build()

      expect(stdout).toMatch(/\//)
      expect(stdout).toMatch(/ƒ \/404/)

      expect(stdout).not.toContain(' /_document')
      expect(stdout).not.toContain(' /_app')
      expect(stdout).not.toContain('<buildId>')

      expect(stdout).not.toContain(' /_error')
      expect(stdout).toContain('○ /')
    })
  })

  describe('Custom Static Error Output', () => {
    const { next } = nextTestSetup({
      files: join(__dirname, 'fixtures', 'with-error-static'),
      skipStart: true,
    })

    it('should not specify /404 as lambda when static', async () => {
      const { cliOutput: stdout } = await next.build()
      expect(stdout).toContain('○ /404')
      expect(stdout).not.toContain('ƒ /_error')
      expect(stdout).not.toContain('<buildId>')
    })
  })

  describe('With Parallel Routes', () => {
    const { next } = nextTestSetup({
      files: join(__dirname, 'fixtures', 'with-parallel-routes'),
      skipStart: true,
    })

    it('should not have duplicate paths that resolve to the same route', async () => {
      const { cliOutput: stdout } = await next.build()
      expect(stdout.match(/○ \/root-page/g)!.length).toBe(1)
    })
  })
})
