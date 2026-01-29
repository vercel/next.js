import { createNext } from 'e2e-utils'
import { NextInstance } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('typescript-native-preview', () => {
  let next: NextInstance

  beforeAll(async () => {
    next = await createNext({
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
        'tsconfig.json': JSON.stringify({
          compilerOptions: {
            target: 'ES2017',
            lib: ['dom', 'dom.iterable', 'esnext'],
            allowJs: true,
            skipLibCheck: true,
            strict: true,
            noEmit: true,
            esModuleInterop: true,
            module: 'esnext',
            moduleResolution: 'bundler',
            resolveJsonModule: true,
            isolatedModules: true,
            jsx: 'preserve',
            incremental: true,
            plugins: [{ name: 'next' }],
          },
          include: ['next-env.d.ts', '**/*.ts', '**/*.tsx'],
          exclude: ['node_modules'],
        }),
      },
      skipStart: true,
      dependencies: {
        // Install @typescript/native-preview instead of typescript
        '@typescript/native-preview': 'latest',
        '@types/react': 'latest',
        '@types/node': 'latest',
        // Explicitly exclude typescript - we want to test that Next.js
        // detects @typescript/native-preview and doesn't auto-install typescript
        typescript: undefined as any,
      },
      // Unset CI env vars since auto-install is skipped in CI
      env: {
        CI: '',
        CIRCLECI: '',
        GITHUB_ACTIONS: '',
        CONTINUOUS_INTEGRATION: '',
        RUN_ID: '',
        BUILD_NUMBER: '',
      },
    })
  })
  afterAll(() => next.destroy())

  it('should detect @typescript/native-preview and not auto-install typescript', async () => {
    await next.start()

    // Check that the info message about native-preview is logged
    await retry(async () => {
      expect(next.cliOutput).toContain('@typescript/native-preview')
      expect(next.cliOutput).toContain('Detected')
    })

    // Should NOT show the "installing dependencies" message for typescript
    expect(next.cliOutput).not.toMatch(/Installing.*typescript/i)

    // The app should still work since SWC/Turbopack handles TS compilation
    const $ = await next.render$('/')
    expect($('p').text()).toBe('hello world')
  })
})
