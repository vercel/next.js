import { nextTestSetup, isNextStart } from 'e2e-utils'

describe('build diagnostics information saved to .next/diagnostics', () => {
  if (!isNextStart) {
    it('should skip for non-next start', () => {})
    return
  }

  const { next } = nextTestSetup({
    files: __dirname,
    dependencies: {},
  })

  it('should contain framework.json', async () => {
    const frameworksJson = await next.readJSON(
      '.next/diagnostics/framework.json'
    )
    expect(frameworksJson).toEqual({
      name: 'Next.js',
      version: require('next/package.json').version,
    })
  })

  it('outputs correct build-diagnostics.json', async () => {
    const buildDiagnosticsJson = await next.readJSON(
      '.next/diagnostics/build-diagnostics.json'
    )
    expect(buildDiagnosticsJson).toMatchObject({
      buildStage: 'static-generation',
      buildOptions: {},
    })
  })
})
