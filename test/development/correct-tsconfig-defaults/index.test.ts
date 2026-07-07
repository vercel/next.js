import { nextTestSetup } from 'e2e-utils'
import { check } from 'next-test-utils'

describe('correct tsconfig.json defaults', () => {
  const { next } = nextTestSetup({
    files: {
      'pages/index.tsx': 'export default function Page() {}',
    },
    skipStart: true,
    dependencies: {
      typescript: 'latest',
      '@types/react': 'latest',
      '@types/node': 'latest',
    },
  })

  it('should add `moduleResolution` when generating tsconfig.json in dev', async () => {
    try {
      expect(
        await next.readFile('tsconfig.json').catch(() => false)
      ).toBeFalse()

      await next.start()

      let content: string
      // wait for tsconfig to be written
      await check(async () => {
        content = await next.readFile('tsconfig.json')
        return content && content !== '{}' ? 'ready' : 'retry'
      }, 'ready')

      const tsconfig = JSON.parse(content)
      expect(next.cliOutput).not.toContain('moduleResolution')

      expect(tsconfig.compilerOptions).toEqual(
        expect.objectContaining({ moduleResolution: 'bundler' })
      )
    } finally {
      await next.stop()
    }
  })

  it('should not warn for `moduleResolution` when already present and valid', async () => {
    try {
      expect(
        await next.readFile('tsconfig.json').catch(() => false)
      ).toBeTruthy()

      await next.start()

      const tsconfig = JSON.parse(await next.readFile('tsconfig.json'))

      expect(tsconfig.compilerOptions).toEqual(
        expect.objectContaining({ moduleResolution: 'bundler' })
      )
      expect(next.cliOutput).not.toContain('moduleResolution')
    } finally {
      await next.stop()
    }
  })
})
