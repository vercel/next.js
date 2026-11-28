import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('types-gen-nounuselocal-dev', () => {
  const { next } = nextTestSetup({
    files: {
      'app/layout.tsx': `
        import type { ReactNode } from 'react'

        export default function RootLayout({
          children,
        }: {
          children: ReactNode
        }) {
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
      // Metadata routes can appear in the dev manifest without producing
      // route-handler validation entries.
      'app/robots.ts': `
        import type { MetadataRoute } from 'next'

        export default function robots(): MetadataRoute.Robots {
          return {
            rules: {
              userAgent: '*',
            },
          }
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
          jsx: 'react-jsx',
          incremental: true,
          noUnusedLocals: true,
        },
        include: [
          'next-env.d.ts',
          '**/*.ts',
          '**/*.tsx',
          '.next/dev/types/**/*.ts',
        ],
        exclude: ['node_modules', '**/*.test.ts', '**/*.test.tsx'],
      }),
    },
  })

  it('should omit route-handler imports for metadata-only routes in dev', async () => {
    await next.render('/')

    await retry(
      async () => {
        const validator = await next.readFile('.next/dev/types/validator.ts')
        expect(validator).not.toContain('AppRouteHandlerRoutes')
        expect(validator).not.toContain('NextRequest')
      },
      5000,
      500
    )
  })
})
