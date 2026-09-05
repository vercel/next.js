import { nextTestSetup } from 'e2e-utils'

describe('optimize-package-imports-local-barrel', () => {
  const { next, isNextStart, skipped } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })
  if (skipped) return

  if (!isNextStart) {
    it('is only applicable in production mode', () => {})
    return
  }

  beforeAll(() => next.start())

  it('invalidates an optimized local barrel between builds', async () => {
    expect(await next.render('/')).toContain('button')

    await next.stop()
    await next.renameFile('ui/Button.tsx', 'ui/CounterButton.tsx')
    await next.patchFile(
      'ui/CounterButton.tsx',
      `export function Button() {\n  return <p id="button">counter</p>\n}\n`
    )
    await next.patchFile(
      'ui/index.ts',
      `export { Button } from './CounterButton'\n`
    )

    const { exitCode, cliOutput } = await next.build()
    expect(exitCode).toBe(0)
    expect(cliOutput).not.toContain("Can't resolve './Button'")

    await next.start({ skipBuild: true })
    expect(await next.render('/')).toContain('counter')
  })
})
