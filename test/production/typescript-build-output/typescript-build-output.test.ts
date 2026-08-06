import { nextTestSetup } from 'e2e-utils'

describe('typescript-build-output', () => {
  const { next, isNextDeploy, isTurbopack, skipped } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

  if (skipped) {
    return
  }

  if (isNextDeploy) {
    it('should skip', () => {})
    return
  }

  const withAppDir = async (callback: () => Promise<void>) => {
    await next.patchFile(
      'app/layout.tsx',
      `export default function RootLayout({ children }: { children: React.ReactNode }) {
        return <html><body>{children}</body></html>
      }`,
      async () => {
        await next.patchFile(
          'app/app/page.tsx',
          'export default function AppPage() { return <p>app</p> }',
          callback
        )
      }
    )
  }

  it('should show "Finished TypeScript" message in build output', async () => {
    await next.build()
    expect(next.cliOutput).toContain('Finished TypeScript')
  })

  if (isTurbopack) {
    it('should overlap App Router type checking with compilation', async () => {
      await withAppDir(async () => {
        const { cliOutput, exitCode } = await next.build()

        expect(exitCode).toBe(0)
        const typeCheckStart = cliOutput.indexOf('Running TypeScript')
        const compileEnd = cliOutput.indexOf('Compiled successfully')
        expect(typeCheckStart).toBeGreaterThan(-1)
        expect(compileEnd).toBeGreaterThan(-1)
        expect(typeCheckStart).toBeLessThan(compileEnd)
      })
    })

    it('should preserve type errors across the TypeScript API worker boundary', async () => {
      await withAppDir(async () => {
        await next.patchFile(
          'pages/index.tsx',
          `export default function Page() {
            const value: string = 42
            return <p>{value}</p>
          }`,
          async () => {
            await next.patchFile(
              'next.config.js',
              'module.exports = { experimental: { useTypeScriptCli: false } }',
              async () => {
                const { cliOutput, exitCode } = await next.build()

                expect(exitCode).toBe(1)
                expect(cliOutput).toContain('Compiled successfully')
                expect(cliOutput).toContain(
                  "Type 'number' is not assignable to type 'string'."
                )
                expect(cliOutput).toContain(
                  'Build failed because of TypeScript errors.'
                )
                expect(cliOutput).not.toContain('Build error occurred')
                expect(cliOutput).not.toContain(
                  'Next.js build worker exited with code'
                )
              }
            )
          }
        )
      })
    })

    it('should check generated App Router validator types', async () => {
      await withAppDir(async () => {
        await next.patchFile(
          'app/[slug]/page.tsx',
          `interface Params { slug: string }
          export default function Page({ params }: { params: Params }) {
            return <p>{params.slug}</p>
          }`,
          async () => {
            await next.patchFile(
              'next.config.js',
              `module.exports = {
                experimental: { strictRouteTypes: true },
              }`,
              async () => {
                const { cliOutput, exitCode } = await next.build()

                expect(exitCode).toBe(1)
                expect(cliOutput).toContain(
                  "Property 'slug' is missing in type 'Promise<{ slug: string; }>'"
                )
              }
            )
          }
        )
      })
    })

    it('should check generated typed-route declarations', async () => {
      await withAppDir(async () => {
        await next.patchFile(
          'app/app/page.tsx',
          `import Link from 'next/link'
          export default function AppPage() {
            return <Link href="/not-a-real-route">app</Link>
          }`,
          async () => {
            await next.patchFile(
              'next.config.js',
              'module.exports = { typedRoutes: true }',
              async () => {
                const { cliOutput, exitCode } = await next.build()

                expect(exitCode).toBe(1)
                expect(cliOutput).toContain(
                  'Type \'"/not-a-real-route"\' is not assignable to type'
                )
              }
            )
          }
        )
      })
    })

    it('should preserve post-compile hook ordering before type checking', async () => {
      const sentinel = 'test runAfterProductionCompile failure'
      await withAppDir(async () => {
        await next.patchFile(
          'next.config.js',
          `module.exports = {
            compiler: {
              runAfterProductionCompile: async () => {
                throw new Error('${sentinel}')
              },
            },
          }`,
          async () => {
            const { cliOutput, exitCode } = await next.build()

            expect(exitCode).toBe(1)
            expect(cliOutput).not.toContain('Finished TypeScript')
            expect(cliOutput).toContain('Compiled successfully')
            expect(cliOutput).toContain(sentinel)
            expect(cliOutput.indexOf('Compiled successfully')).toBeLessThan(
              cliOutput.indexOf(sentinel)
            )
          }
        )
      })
    })
  }
})
