import { nextTestSetup } from 'e2e-utils'

describe('next-phase', () => {
  const { next, isNextDev, skipped } = nextTestSetup({
    // This test is skipped when deployed because it asserts against runtime
    // logs that cannot be queried in a deployed environment.
    skipDeployment: true,
    files: {
      'app/layout.js': `export default function Layout({ children }) {
        return <html><body>{children}</body></html>
      }`,
      'app/page.js': `export default function Page() { return <p>{'app'}</p> }`,
      'pages/foo.js': `export default function Page() { return <p>{'pages'}</p> }`,
      'next.config.js': `
        module.exports = (phase, { defaultConfig }) => {
          console.log(phase)
          return defaultConfig
        }
      `,
    },
  })

  if (skipped) return

  it('should render page with next phase correctly', async () => {
    const phases = {
      dev: 'phase-development-server',
      build: 'phase-production-build',
      start: 'phase-production-server',
    }
    const currentPhase = isNextDev ? phases.dev : phases.build
    const nonExistedPhase = isNextDev ? phases.build : phases.dev

    expect(next.cliOutput).toContain(currentPhase)
    expect(next.cliOutput).not.toContain(nonExistedPhase)

    await next.fetch('/')
    await next.fetch('/foo')

    if (isNextDev) {
      expect(next.cliOutput).not.toContain(phases.start)
    } else {
      expect(next.cliOutput).toContain(phases.start)
    }
  })
})
