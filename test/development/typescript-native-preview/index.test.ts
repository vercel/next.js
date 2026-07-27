import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('typescript-native-preview', () => {
  const { next } = nextTestSetup({
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
    dependencies: {
      // Explicitly exclude typescript from default dependencies
      // so that we can test the native-preview detection
      typescript: undefined,
      // Install @typescript/native-preview instead of typescript
      '@typescript/native-preview': 'latest',
      '@types/react': 'latest',
      '@types/node': 'latest',
    },
  })

  it('should detect @typescript/native-preview and not auto-install typescript', async () => {
    // The app should still work since SWC/Turbopack handles TS compilation
    const $ = await next.render$('/')
    expect($('p').text()).toBe('hello world')

    // Wait for the info message about native-preview to be logged
    // The TypeScript verification happens asynchronously after page render
    await retry(() => {
      expect(next.cliOutput).toMatch(
        /Detected.*@typescript\/native-preview|@typescript\/native-preview.*detected/i
      )
    })

    // Should NOT show that typescript is being installed as a dependency
    // (it should recognize that native-preview is a valid alternative)
    expect(next.cliOutput).not.toMatch(/Installing.*typescript[^/]/i)
  })
})
