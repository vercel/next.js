import { nextTestSetup, isNextDev, isNextStart } from 'e2e-utils'
import fs from 'fs-extra'
import { join } from 'path'

describe('TypeScript Image Component', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
    skipStart: true,
    skipDeployment: true,
  })
  if (skipped) return

  if (isNextStart) {
    it('should fail to build invalid usage of the Image component', async () => {
      const { cliOutput, exitCode } = await next.build()
      expect(cliOutput).toMatch(/Failed to type check/)
      expect(cliOutput).toMatch(/is not assignable to type/)
      expect(exitCode).toBe(1)
      const envTypes = await fs.readFile(
        join(next.testDir, 'next-env.d.ts'),
        'utf8'
      )
      expect(envTypes).toContain('image-types/global')
    })

    it('should remove global image types when disabled', async () => {
      const nextConfigPath = join(next.testDir, 'next.config.js')
      const content = await fs.readFile(nextConfigPath, 'utf8')
      await fs.writeFile(
        nextConfigPath,
        content.replace('// disableStaticImages', 'disableStaticImages')
      )
      const { exitCode, cliOutput } = await next.build()
      expect(cliOutput).toMatch(/Failed to type check/)
      expect(cliOutput).toMatch(/is not assignable to type/)
      expect(exitCode).toBe(1)
      await fs.writeFile(nextConfigPath, content)
      const envTypes = await fs.readFile(
        join(next.testDir, 'next-env.d.ts'),
        'utf8'
      )
      expect(envTypes).not.toContain('image-types/global')
    })
  }

  if (isNextDev) {
    let output = ''

    beforeAll(async () => {
      output = ''
      next.on('stdout', (msg) => {
        output += msg
      })
      next.on('stderr', (msg) => {
        output += msg
      })
      await next.start()
      await next.fetch('/')
    })

    it('should have image types when enabled', async () => {
      const envTypes = await fs.readFile(
        join(next.testDir, 'next-env.d.ts'),
        'utf8'
      )
      expect(envTypes).toContain('image-types/global')
    })

    it('should render the valid Image usage and not print error', async () => {
      const html = await next.render('/valid')
      expect(html).toMatch(/This is valid usage of the Image component/)
      expect(output).not.toMatch(/Error: Image/)
    })

    it('should print error when invalid Image usage', async () => {
      await next.render('/invalid')
      expect(output).toMatch(/Error: Image/)
    })

    it('should remove global image types when disabled (dev)', async () => {
      const nextConfigPath = join(next.testDir, 'next.config.js')
      const content = await fs.readFile(nextConfigPath, 'utf8')
      await fs.writeFile(
        nextConfigPath,
        content.replace('// disableStaticImages', 'disableStaticImages')
      )
      await next.stop()
      await next.start()
      await next.fetch('/')
      await next.stop()
      await fs.writeFile(nextConfigPath, content)
      const envTypes = await fs.readFile(
        join(next.testDir, 'next-env.d.ts'),
        'utf8'
      )
      expect(envTypes).not.toContain('image-types/global')
    })
  }
})
