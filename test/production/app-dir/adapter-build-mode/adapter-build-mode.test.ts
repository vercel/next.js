import { readFile } from 'fs/promises'
import { nextTestSetup } from 'e2e-utils'
import type { NextAdapter } from 'next'

type BuildCompleteContext = Parameters<
  NonNullable<NextAdapter['onBuildComplete']>
>[0]

describe.each(['compile/generate', 'default'])(
  'adapter-build-mode: %s',
  (mode) => {
    const { next } = nextTestSetup({
      files: __dirname,
      skipStart: true,
    })

    it('should complete the adapter only after generating its outputs', async () => {
      if (mode === 'compile/generate') {
        const compile = await next.build({
          args: ['--experimental-build-mode', 'compile'],
        })

        expect(compile.exitCode).toBe(0)
        expect(compile.cliOutput).toContain('adapter-build-mode: modifyConfig')
        expect(compile.cliOutput).not.toContain(
          'adapter-build-mode: onBuildComplete'
        )
        expect(await next.hasFile('build-complete.json')).toBe(false)

        const { config } = await next.readJSON(
          '.next/required-server-files.json'
        )
        expect(config.basePath).toBe('/adapter')
        expect(config.env.ADAPTER_BUILD_MODE).toBe('configured by adapter')
      }

      const result = await next.build({
        args:
          mode === 'compile/generate'
            ? ['--experimental-build-mode', 'generate']
            : [],
      })

      expect(result.exitCode).toBe(0)
      expect(result.cliOutput).toContain('adapter-build-mode: modifyConfig')
      expect(
        next.cliOutput.match(/adapter-build-mode: onBuildComplete/g)
      ).toHaveLength(1)

      const { config, outputs }: BuildCompleteContext = await next.readJSON(
        'build-complete.json'
      )
      expect(config.basePath).toBe('/adapter')
      expect(config.env.ADAPTER_BUILD_MODE).toBe('configured by adapter')

      const pagePath = outputs.prerenders.find(
        (output) => output.pathname === '/adapter'
      )?.fallback?.filePath
      expect(pagePath).toBeString()
      // The rendered value also proves modifyConfig applied at compilation time.
      expect(await readFile(pagePath!, 'utf8')).toContain(
        'configured by adapter'
      )

      const image = outputs.staticFiles.find(
        (output) => output.pathname === '/adapter/opengraph-image.png'
      )
      expect(image).toBeDefined()
      expect(image?.filePath).toMatch(/\.body$/)
      expect(await readFile(image!.filePath)).toEqual(
        await next.readFileBuffer('app/opengraph-image.png')
      )
      expect(
        outputs.appRoutes.find(
          (output) => output.pathname === '/adapter/opengraph-image.png'
        )
      ).toBeUndefined()
    })
  }
)
