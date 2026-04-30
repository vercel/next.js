import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createNext } from 'e2e-utils'
import type { NextInstance } from 'e2e-utils'

// Reproduces https://github.com/vercel/next.js/issues/93336
// When path aliases are inherited from a parent tsconfig (monorepo setup),
// getTypeScriptConfiguration deletes baseUrl for TS6 compat and must set
// pathsBasePath to the app tsconfig directory so that rewritten aliases
// (e.g. ../../packages/shared/src/*) resolve relative to the app dir.
describe('TypeScript pathsBasePath fix for TS6 monorepo path aliases', () => {
  let next: NextInstance
  let baseTsConfigDir: string

  beforeAll(async () => {
    // Create a "repo root" directory outside the Next.js project that holds
    // the shared base tsconfig and packages — simulating a monorepo layout.
    baseTsConfigDir = await mkdtemp(join(tmpdir(), 'nextjs-test-ts-base-'))

    // Root tsconfig: defines baseUrl and paths (the classic monorepo pattern)
    await writeFile(
      join(baseTsConfigDir, 'tsconfig.base.json'),
      JSON.stringify({
        compilerOptions: {
          baseUrl: '.',
          paths: {
            '@shared/*': ['packages/shared/src/*'],
          },
        },
      })
    )

    // Shared package that will be imported via path alias
    await mkdir(join(baseTsConfigDir, 'packages', 'shared', 'src'), {
      recursive: true,
    })
    await writeFile(
      join(baseTsConfigDir, 'packages', 'shared', 'src', 'index.ts'),
      'export const greet = (name: string): string => "Hello, " + name + "!"'
    )

    next = await createNext({
      files: {
        'next.config.js': `module.exports = {}`,
        // App-level tsconfig extends the root tsconfig via absolute path.
        // This is the scenario from #93336: aliases are defined in the root
        // tsconfig, so TypeScript sets pathsBasePath to the root dir —
        // which means our fix (setting pathsBasePath = app tsconfig dir)
        // is required for the rewritten paths to resolve correctly.
        'tsconfig.json': JSON.stringify({
          extends: join(baseTsConfigDir, 'tsconfig.base.json'),
          compilerOptions: {
            target: 'ES2020',
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
        'app/layout.tsx': `
export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
`,
        // Page that imports from the @shared/* path alias defined in the base tsconfig.
        // Without the pathsBasePath fix, TypeScript would fail with:
        //   Type error: Cannot find module '@shared/index' or its corresponding type declarations.
        'app/page.tsx': `
import { greet } from '@shared/index'

export default function Page() {
  return <p>{greet('world')}</p>
}
`,
      },
      dependencies: {
        // Use TypeScript 6+ to trigger the TS6 compat code path in getTypeScriptConfiguration.
        // The baseUrl-to-pathsBasePath migration only runs for semver >= 6.0.0.
        typescript: '^6.0.0',
        '@types/node': 'latest',
        '@types/react': 'latest',
        '@types/react-dom': 'latest',
      },
    })
  })

  afterAll(async () => {
    await next?.destroy()
  })

  it('should build successfully without "Cannot find module" type errors', async () => {
    // If pathsBasePath is not set after deleting baseUrl, TypeScript resolves
    // the rewritten relative aliases (e.g. ../../packages/shared/src/*) from
    // the repo root dir instead of the app dir — producing paths that don't exist.
    expect(next.cliOutput).not.toContain('Cannot find module')
    expect(next.cliOutput).not.toContain('Type error')
    expect(next.cliOutput).not.toContain('Failed to compile')
  })

  it('should render the page that uses the aliased module', async () => {
    const html = await next.render('/')
    expect(html).toContain('Hello, world!')
  })
})
