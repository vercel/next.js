import path from 'path'
import { FileRef, nextTestSetup } from 'e2e-utils'
import { gate, renderViaHTTP } from 'next-test-utils'

describe('TypeScript basic', () => {
  const { next } = nextTestSetup({
    files: new FileRef(path.join(__dirname, 'app')),
    dependencies: {
      '@next/bundle-analyzer': 'workspace:*',
      '@types/react': 'latest',
      '@types/react-dom': 'latest',
    },
  })

  it('should not have eslint setup started', async () => {
    expect(next.cliOutput).not.toContain(
      'How would you like to configure ESLint'
    )
  })

  it('have built and started correctly', async () => {
    const html = await renderViaHTTP(next.url, '/')
    expect(html).toContain('hello world')
  })

  // Turbopack doesn't support Babel built-in.
  // @force-gate !turbopack
  it('should work with babel', async () => {
    await next.stop()
    await next.patchFile(
      '.babelrc',
      JSON.stringify({ presets: ['next/babel'] })
    )
    if (await gate((conditions) => conditions.futureCompat)) {
      await expect(next.start()).rejects.toThrow(
        'next build failed with code/signal 1'
      )
      expect(next.cliOutput).toContain('DEP0111')
      expect(next.cliOutput).toContain('process.binding()')
      return
    }
    await next.start()

    const html = await renderViaHTTP(next.url, '/')
    expect(html).toContain('hello world')
  })
})
