import { runNextCommand } from 'next-test-utils'
import { join } from 'path'
import { expectedWhenTrailingSlashTrue, getFiles } from './utils'
import { FileRef, isNextStart, nextTestSetup, PatchedFileRef } from 'e2e-utils'

describe('app dir - with output export', () => {
  if (isNextStart) {
    describe('with exportPathMap configured', () => {
      let { next } = nextTestSetup({
        files: {
          app: new FileRef(join(__dirname, '..', 'app')),
          'next.config.js': new PatchedFileRef(
            join(__dirname, '..', 'next.config.js'),
            (content) =>
              content.replace(
                'trailingSlash: true,',
                `trailingSlash: true,
       exportPathMap: async function (map) {
        return map
      },`
              )
          ),
        },
        skipStart: true,
      })

      it('should throw', async () => {
        let { exitCode, cliOutput } = await next.build()
        expect(exitCode).toBe(1)
        expect(cliOutput).toContain(
          'The "exportPathMap" configuration cannot be used with the "app" directory. Please use generateStaticParams() instead.'
        )
      })
    })

    describe('without next config', () => {
      let { next } = nextTestSetup({
        files: {
          app: new FileRef(join(__dirname, '..', 'app')),
        },
        skipStart: true,
      })

      it('should error when running next export', async () => {
        let { exitCode } = await next.build()
        expect(exitCode).toBe(0)
        expect(await getFiles(join(next.testDir, 'out'))).toEqual([])

        let stdout = ''
        let stderr = ''
        let error = undefined
        try {
          await runNextCommand(['export'], {
            cwd: next.testDir,
            onStdout(msg) {
              stdout += msg
            },
            onStderr(msg) {
              stderr += msg
            },
          })
        } catch (e) {
          error = e
        }
        expect(error).toBeDefined()
        expect(stderr).toContain(
          `\`next export\` has been removed in favor of 'output: export' in next.config.js`
        )
        expect(stdout).not.toContain('Export successful. Files written to')
        expect(await getFiles(join(next.testDir, 'out'))).toEqual([])
      })
    })

    describe('with distDir configured', () => {
      let { next } = nextTestSetup({
        files: {
          app: new FileRef(join(__dirname, '..', 'app')),
          'next.config.js': new PatchedFileRef(
            join(__dirname, '..', 'next.config.js'),
            (content) =>
              content.replace(
                'trailingSlash: true,',
                `trailingSlash: true,
       distDir: 'output',`
              )
          ),
        },
        skipStart: true,
      })

      it('should correctly emit exported assets to config.distDir', async () => {
        let { exitCode } = await next.build()
        expect(exitCode).toBe(0)
        expect(await getFiles(join(next.testDir, 'output'))).toEqual(
          expectedWhenTrailingSlashTrue
        )
      })
    })
  } else {
    it('skipped in dev', () => {})
  }
})
