import { nextTestSetup, isNextDev, isNextStart } from 'e2e-utils'
import { listClientChunks } from 'next-test-utils'
import fs from 'fs-extra'
import path from 'path'

const warningText = `You are using a non-standard "NODE_ENV" value in your environment`

describe('Non-Standard NODE_ENV', () => {
  ;(isNextDev ? describe : describe.skip)('dev mode', () => {
    describe('no NODE_ENV set', () => {
      const { next } = nextTestSetup({
        files: __dirname,
      })

      it('should not show the warning with no NODE_ENV set', async () => {
        expect(next.cliOutput).not.toContain(warningText)
      })
    })

    describe('NODE_ENV=development', () => {
      const { next } = nextTestSetup({
        files: __dirname,
        env: { NODE_ENV: 'development' },
      })

      it('should not show the warning with NODE_ENV set to valid value', async () => {
        expect(next.cliOutput).not.toContain(warningText)
      })
    })

    describe('NODE_ENV=development (custom server)', () => {
      const { next } = nextTestSetup({
        files: __dirname,
        startCommand: 'node server.js',
        serverReadyPattern: /- Local:/,
        dependencies: { 'get-port': '5.1.1' },
        env: { NODE_ENV: 'development' },
      })

      it('should not show the warning with NODE_ENV set to valid value (custom server)', async () => {
        expect(next.cliOutput).not.toContain(warningText)
      })
    })

    describe('NODE_ENV=abc', () => {
      const { next } = nextTestSetup({
        files: __dirname,
        env: { NODE_ENV: 'abc' },
      })

      it('should show the warning with NODE_ENV set to invalid value', async () => {
        expect(next.cliOutput).toContain(warningText)
      })
    })

    describe('NODE_ENV=abc (custom server)', () => {
      const { next } = nextTestSetup({
        files: __dirname,
        startCommand: 'node server.js',
        serverReadyPattern: /- Local:/,
        dependencies: { 'get-port': '5.1.1' },
        env: { NODE_ENV: 'abc' },
      })

      it('should show the warning with NODE_ENV set to invalid value (custom server)', async () => {
        expect(next.cliOutput).toContain(warningText)
      })
    })

    describe('NODE_ENV=production', () => {
      const { next } = nextTestSetup({
        files: __dirname,
        env: { NODE_ENV: 'production' },
      })

      it('should show the warning with NODE_ENV set to production with next dev', async () => {
        expect(next.cliOutput).toContain(warningText)
      })
    })
  })
  ;(isNextStart ? describe : describe.skip)('production mode', () => {
    describe('DCE with NODE_ENV=test', () => {
      const { next } = nextTestSetup({
        files: __dirname,
        skipStart: true,
        env: { NODE_ENV: 'test' },
      })

      it('should still DCE NODE_ENV specific code', async () => {
        await next.build()

        const distDir = path.join(next.testDir, next.distDir)
        const staticFiles = (await listClientChunks(distDir)).filter((f) =>
          f.endsWith('.js')
        )
        expect(staticFiles.length).toBeGreaterThan(0)

        let foundProductionValue = false
        let foundOtherValue = false
        for (const file of staticFiles) {
          const content = await fs.readFile(path.join(distDir, file), 'utf8')

          if (content.includes('Hello Production')) {
            foundProductionValue = true
          }
          if (content.includes('Hello Other')) {
            foundOtherValue = true
          }
        }

        expect(foundProductionValue).toBeTrue()
        expect(foundOtherValue).toBeFalse()
      })
    })

    describe('build warning with NODE_ENV=development', () => {
      const { next } = nextTestSetup({
        files: __dirname,
        skipStart: true,
        env: { NODE_ENV: 'development' },
      })

      it('should show the warning with NODE_ENV set to development with next build', async () => {
        const start = next.cliOutput.length
        await next.build()
        expect(next.cliOutput.slice(start)).toContain(warningText)
      })
    })

    describe('start warning with NODE_ENV=development', () => {
      const { next } = nextTestSetup({
        files: __dirname,
        skipStart: true,
      })

      it('should show the warning with NODE_ENV set to development with next start', async () => {
        // Build without NODE_ENV=development. Matches the original integration
        // test, which only sets NODE_ENV=development for `next start` (not
        // `next build`). Building with NODE_ENV=development additionally
        // triggers unrelated turbopack production-build issues.
        await next.build()
        next.env.NODE_ENV = 'development'
        // `next.start()` resets `cliOutput` to '' so we do not need to slice
        // from a pre-start index.
        await next.start({ skipBuild: true })
        expect(next.cliOutput).toContain(warningText)
      })
    })
  })
})
