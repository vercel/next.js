import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

const conflict =
  'Two or more assets with different content were emitted to the same output path'

describe('webpack-loader-emit-file-conflicts', () => {
  const { next, isNextDev, isTurbopack } = nextTestSetup({
    files: __dirname,
  })

  it('allows separate modules to emit identical contents at the same path', async () => {
    const $ = await next.render$('/')
    expect($('p').text()).toBe('first:second')
    const response = await next.fetch(
      `/_next/static/media/shared.txt${next.getAssetQuery()}`
    )
    expect(response.status).toBe(200)
    expect(await response.text()).toBe('shared-content\n')
  })

  it('allows separate modules to emit identical contents with different source maps', async () => {
    const response = await next.fetch(
      `/_next/static/media/same-map.js${next.getAssetQuery()}`
    )
    expect(response.status).toBe(200)
    expect(await response.text()).toContain('console.log("same")')
  })

  it('allows different compilers to emit identical contents at the same path', async () => {
    const response = await next.fetch(
      `/_next/static/media/compiler.txt${next.getAssetQuery()}`
    )
    expect(response.status).toBe(200)
    expect(await response.text()).toBe('same')
  })

  // Conflicting assets cannot produce a deployment; identical emissions above also run on deploy.
  // @force-gate !deploy
  it('rejects separate modules emitting different contents at the same path', async () => {
    const message = isTurbopack
      ? conflict
      : 'Conflict: Multiple assets emit different content to the same filename'
    const outputStart = next.cliOutput.length
    if (!isNextDev) {
      await next.stop()
    }
    await next.patchFile(
      'fixtures/second.second',
      'different-content\n',
      async () => {
        if (isNextDev) {
          await retry(async () => {
            expect((await next.fetch('/')).status).toBe(500)
            expect(next.cliOutput.slice(outputStart)).toContain(message)
            expect(next.cliOutput.slice(outputStart)).toContain('shared.txt')
          })
        } else {
          const { exitCode, cliOutput } = await next.build()
          expect(exitCode).toBe(1)
          expect(cliOutput).toContain(message)
          expect(cliOutput).toContain('shared.txt')
        }
      }
    )
  })

  // Webpack's compilers each write their own copy, so the last one silently wins.
  // @force-gate !deploy
  it('rejects different compilers emitting different contents at the same path in Turbopack', async () => {
    const outputStart = next.cliOutput.length
    if (!isNextDev) {
      await next.stop()
    }
    await next.patchFile(
      'fixtures/value.per-compiler',
      'per-compiler\n',
      async () => {
        if (isNextDev) {
          await retry(async () => {
            const response = await next.fetch('/')
            if (isTurbopack) {
              expect(response.status).toBe(500)
              expect(next.cliOutput.slice(outputStart)).toContain(conflict)
              expect(next.cliOutput.slice(outputStart)).toContain(
                'compiler.txt'
              )
            } else {
              expect(response.status).toBe(200)
            }
          })
        } else {
          const { exitCode, cliOutput } = await next.build()
          if (isTurbopack) {
            expect(exitCode).toBe(1)
            expect(cliOutput).toContain(conflict)
            expect(cliOutput).toContain('compiler.txt')
          } else {
            expect(exitCode).toBe(0)
          }
        }
      }
    )
  })

  // @force-gate !deploy
  it('rejects separate routes emitting different contents at the same path', async () => {
    const message = isTurbopack
      ? conflict
      : 'Conflict: Multiple assets emit different content to the same filename'
    const outputStart = next.cliOutput.length
    if (!isNextDev) {
      await next.stop()
    }
    await next.patchFile(
      'fixtures/other.route',
      'different-route\n',
      async () => {
        if (isNextDev) {
          await retry(async () => {
            await next.fetch('/')
            await next.fetch('/other')
            expect(next.cliOutput.slice(outputStart)).toContain(message)
            expect(next.cliOutput.slice(outputStart)).toContain('route.txt')
          })
        } else {
          const { exitCode, cliOutput } = await next.build()
          expect(exitCode).toBe(1)
          expect(cliOutput).toContain(message)
          expect(cliOutput).toContain('route.txt')
        }
      }
    )
  })

  async function expectInvalidName(name: string, problem: string) {
    const outputStart = next.cliOutput.length
    if (!isNextDev) {
      await next.stop()
    }
    await next.patchFile('fixtures/emit.name', `${name}\n`, async () => {
      if (isNextDev) {
        await retry(async () => {
          await next.fetch('/')
          expect(next.cliOutput.slice(outputStart)).toContain(problem)
        })
      } else {
        const { exitCode, cliOutput } = await next.build()
        expect(exitCode).toBe(1)
        expect(cliOutput).toContain(problem)
      }
    })
  }

  // Webpack writes the file wherever the name points, even outside the project.
  // @force-gate turbopack && !deploy
  it('rejects emitted file names outside of the output directory', async () => {
    await expectInvalidName(
      '../../../../../../../../../outside.txt',
      'is outside of the output directory'
    )
  })

  // Webpack fails writing the directory with an EISDIR error.
  // @force-gate turbopack && !deploy
  it('rejects emitted file names that name a directory', async () => {
    await expectInvalidName(
      'directory/',
      'names a directory rather than a file'
    )
  })

  // Development builds don't minify.
  // @force-gate !dev && !deploy
  it('fails the build when an emitted file cannot be minified', async () => {
    await next.stop()
    await next.patchFile('fixtures/emit.name', 'broken.js\n', async () => {
      const { exitCode, cliOutput } = await next.build()
      expect(exitCode).toBe(1)
      if (isTurbopack) {
        expect(cliOutput).toContain('"../../static/media/broken.js"')
        expect(cliOutput).toContain('could not be minified')
      }
    })
  })
})
