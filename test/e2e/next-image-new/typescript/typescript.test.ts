import { nextTestSetup, isNextDev } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('TypeScript Image Component Build Errors', () => {
  if (isNextDev) {
    it('no-op in dev', () => {})
    return
  }

  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
    skipDeployment: true,
  })

  it('should fail to build invalid usage of the Image component', async () => {
    const { exitCode } = await next.build()
    expect(next.cliOutput).toMatch(/Failed to type check/)
    expect(next.cliOutput).toMatch(/is not assignable to type/)
    expect(exitCode).toBe(1)
    const envTypes = await next.readFile('next-env.d.ts')
    expect(envTypes).toContain('image-types/global')
  })

  it('should remove global image types when disabled', async () => {
    await next.patchFile(
      'next.config.js',
      (content) =>
        content.replace('// disableStaticImages', 'disableStaticImages'),
      async () => {
        const { exitCode } = await next.build()
        expect(next.cliOutput).toMatch(/Failed to type check/)
        expect(next.cliOutput).toMatch(/is not assignable to type/)
        expect(exitCode).toBe(1)
        const envTypes = await next.readFile('next-env.d.ts')
        expect(envTypes).not.toContain('image-types/global')
      }
    )
  })
})

describe('TypeScript Image Component Dev', () => {
  if (!isNextDev) {
    it('no-op in prod', () => {})
    return
  }

  const { next } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
  })

  it('should have image types when enabled', async () => {
    await retry(async () => {
      const envTypes = await next.readFile('next-env.d.ts')
      expect(envTypes).toContain('image-types/global')
    })
  })

  it('should render the valid Image usage and not print error', async () => {
    const html = await next.render('/valid')
    expect(html).toMatch(/This is valid usage of the Image component/)
    expect(next.cliOutput).not.toMatch(/Error: Image/)
  })

  it('should print error when invalid Image usage', async () => {
    await next.render('/invalid')
    expect(next.cliOutput).toMatch(/Error: Image/)
  })

  it('should remove global image types when disabled', async () => {
    await next.patchFile(
      'next.config.js',
      (content) =>
        content.replace('// disableStaticImages', 'disableStaticImages'),
      async () => {
        await next.fetch('/')
        const envTypes = await next.readFile('next-env.d.ts')
        expect(envTypes).not.toContain('image-types/global')
      }
    )
  })
})
