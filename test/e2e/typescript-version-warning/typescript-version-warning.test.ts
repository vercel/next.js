import { promises as fs } from 'node:fs'
import path from 'node:path'

import { nextTestSetup } from 'e2e-utils'

describe('typescript-version-warning', () => {
  const { next, isNextDeploy, isNextDev, isTurbopack, skipped } = nextTestSetup(
    {
      files: __dirname,
      skipStart: true,
      skipDeployment: true,
      dependencies: {
        typescript: '4.0.6',
      },
    }
  )

  if (skipped) {
    return
  }

  if (isNextDeploy || isNextDev) {
    it('should skip', () => {})
    return
  }

  it('should print warning when old typescript version is used with next build', async () => {
    await next.start().catch(() => {})
    const versionWarning =
      'Minimum recommended TypeScript version is v5.1.0, older versions can potentially be incompatible with Next.js. Detected: 4.0.6'

    expect(next.cliOutput).toContain(versionWarning)
    expect(next.cliOutput.split(versionWarning)).toHaveLength(2)
    if (isTurbopack) {
      expect(next.cliOutput).toContain('error TS6046')
      expect(next.cliOutput).toContain('Compiled successfully')
      expect(await next.readFile('.next/server/app/page.js')).not.toHaveLength(
        0
      )
      expect(next.cliOutput).toContain(
        'Build failed because of TypeScript errors.'
      )
      expect(next.cliOutput).not.toContain(
        'Next.js build worker exited with code'
      )
    }
  })

  if (isTurbopack) {
    it('should preserve compiler errors when concurrent type checking fails', async () => {
      await next.patchFile(
        'app/page.tsx',
        `
          import value from './missing'

          export default function Page() {
            return <p>{value}</p>
          }
        `
      )

      await next.start().catch(() => {})
      const output = next.cliOutput

      expect(output).toContain("Can't resolve './missing'")
      expect(output).not.toContain('UnhandledPromiseRejection')
      expect(output).not.toContain('Build failed because of TypeScript errors.')
    })

    it('should preserve type-checking infrastructure errors', async () => {
      const sentinel = 'test TypeScript API loading failure'

      await next.patchFile(
        'app/page.tsx',
        `export default function Page() {
          return <p>hello world</p>
        }`,
        async () => {
          await next.patchFile(
            'next.config.js',
            'module.exports = { experimental: { useTypeScriptCli: false } }',
            async () => {
              const typescriptPath = path.join(
                next.testDir,
                'node_modules/typescript/lib/typescript.js'
              )
              const backupPath = `${typescriptPath}.next-test-backup`

              // pnpm may hardlink installed files to its content-addressable
              // store. Rename first so writing the stub creates a fresh inode
              // and cannot corrupt the shared store.
              await fs.rename(typescriptPath, backupPath)
              try {
                await fs.writeFile(
                  typescriptPath,
                  `throw new Error('${sentinel}')`
                )
                await next.start().catch(() => {})
                expect(next.cliOutput).toContain(sentinel)
                expect(next.cliOutput).toContain('Build error occurred')
                expect(next.cliOutput).not.toContain(
                  'Build failed because of TypeScript errors.'
                )
              } finally {
                await fs.rm(typescriptPath, { force: true })
                await fs.rename(backupPath, typescriptPath)
              }
            }
          )
        }
      )
    })

    it.each([
      ['non-zero code', 'process.exit(73)'],
      ['signal', "process.kill(process.pid, 'SIGKILL')"],
    ])(
      'should report unexpected checker worker exits (%s)',
      async (_, crash) => {
        await next.patchFile(
          'next.config.js',
          'module.exports = { experimental: { useTypeScriptCli: false } }',
          async () => {
            await next.patchFile(
              'app/page.tsx',
              `export default function Page() {
              return <p>hello world</p>
            }`,
              async () => {
                const typescriptPath = path.join(
                  next.testDir,
                  'node_modules/typescript/lib/typescript.js'
                )
                const backupPath = `${typescriptPath}.next-test-backup`

                await fs.rename(typescriptPath, backupPath)
                try {
                  await fs.writeFile(typescriptPath, crash)
                  await next.start().catch(() => {})

                  expect(next.cliOutput).toContain('Compiled successfully')
                  expect(next.cliOutput).toContain(
                    'TypeScript checker worker exited unexpectedly. This may be caused by insufficient memory.'
                  )
                  expect(next.cliOutput).not.toContain(
                    'Next.js build worker exited with code'
                  )
                } finally {
                  await fs.rm(typescriptPath, { force: true })
                  await fs.rename(backupPath, typescriptPath)
                }
              }
            )
          }
        )
      }
    )
  }
})
