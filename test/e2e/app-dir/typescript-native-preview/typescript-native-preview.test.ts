import { nextTestSetup } from 'e2e-utils'

describe('typescript-native-preview', () => {
  const { next, isNextDev, skipped } = nextTestSetup({
    files: __dirname,
    skipStart: true,
    dependencies: {
      // Install @typescript/native-preview instead of typescript
      '@typescript/native-preview': 'latest',
    },
  })

  if (skipped) {
    return
  }

  // Only run in dev mode where typescript detection matters
  if (!isNextDev) {
    it('should skip in non-dev mode', () => {})
    return
  }

  it('should detect @typescript/native-preview and not auto-install typescript', async () => {
    await next.start()

    // Check that the info message about native-preview is logged
    expect(next.cliOutput).toContain('@typescript/native-preview')
    expect(next.cliOutput).toContain('Detected')

    // Should NOT show the "installing dependencies" message for typescript
    expect(next.cliOutput).not.toMatch(
      /Installing.*typescript/i
    )

    // The app should still work since SWC/Turbopack handles TS compilation
    const $ = await next.render$('/')
    expect($('p').text()).toBe('hello world')
  })
})
