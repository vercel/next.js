import { nextTestSetup } from 'e2e-utils'

describe('pnpm-workspace-root', () => {
  const { next, skipped } = nextTestSetup({
    files: {
      'app/layout.tsx': `
        import { ReactNode } from 'react'
        export default function Root({ children }: { children: ReactNode }) {
          return (
            <html>
              <body>{children}</body>
            </html>
          )
        }
      `,
      'app/page.tsx': `
        export default function Page() {
          return <p>hello world</p>
        }
      `,
      // Write a package-lock.json (npm lockfile, ignored by pnpm) to the parent
      // directory to create the scenario where multiple "lockfiles" exist.
      '../package-lock.json': JSON.stringify({
        name: 'parent-workspace',
        version: '1.0.0',
        lockfileVersion: 3,
      }),
      // Write pnpm-workspace.yaml in the same parent directory.
      // This file should be prioritized over lockfiles when determining root.
      // Note: pnpm-workspace.yaml will be detected by pnpm, but since we also
      // include a proper package.json, it should work correctly.
      '../pnpm-workspace.yaml': 'packages:\n  - "test"\n',
      '../package.json': JSON.stringify({
        name: 'workspace-root',
        private: true,
      }),
    },
    // So that parent files don't leave the isolated testDir
    subDir: 'test',
    skipDeployment: true,
  })

  if (skipped) {
    return
  }

  it('should detect root directory from pnpm-workspace.yaml', async () => {
    // The app should start successfully when pnpm-workspace.yaml is present
    const browser = await next.browser('/')
    expect(await browser.elementByCss('p').text()).toBe('hello world')
  })

  it('should not have multiple lockfiles warning when pnpm-workspace.yaml is present', async () => {
    // When pnpm-workspace.yaml is found, it should be used as the root indicator
    // and we shouldn't see the "multiple lockfiles" warning since pnpm-workspace.yaml
    // is prioritized and acts as the definitive workspace root marker
    expect(next.cliOutput).not.toMatch(/We detected multiple lockfiles/)
  })
})
