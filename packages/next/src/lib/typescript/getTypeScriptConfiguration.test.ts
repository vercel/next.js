import { mkdtemp, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
// eslint-disable-next-line import/no-extraneous-dependencies
import ts from 'typescript'
import { getTypeScriptConfiguration } from './getTypeScriptConfiguration'

describe('getTypeScriptConfiguration()', () => {
  let tmpDir: string
  let tsConfigPath: string

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'nextjs-ts-config-test-'))
    tsConfigPath = join(tmpDir, 'tsconfig.json')
  })

  describe('TypeScript 6 compat — pathsBasePath', () => {
    it('removes baseUrl and sets pathsBasePath to tsconfig dir for TS6 compat', async () => {
      // The scenario not addressed by #92277 (which handled paths-without-baseUrl):
      // when a tsconfig HAS baseUrl, the TS6 compat code rewrites paths to
      // relative form and deletes baseUrl. TypeScript then needs pathsBasePath
      // to determine the root for resolving those rewritten aliases. Without
      // setting pathsBasePath, TypeScript falls back to the repo root (or CWD)
      // which breaks monorepo setups where the app lives in a subdirectory.
      await writeFile(
        tsConfigPath,
        JSON.stringify({
          compilerOptions: {
            baseUrl: '.',
            paths: {
              '@lib/*': ['./src/lib/*'],
            },
          },
        }),
        { encoding: 'utf8' }
      )

      const result = await getTypeScriptConfiguration(ts, tsConfigPath, true)

      // baseUrl must be removed so TS6 deprecation checks don't fail type checking
      expect(result.options.baseUrl).toBeUndefined()
      // pathsBasePath must be set to the tsconfig directory so the rewritten
      // ../../... aliases resolve relative to the app dir, not the repo root
      expect(result.options.pathsBasePath).toBe(dirname(tsConfigPath))
    })

    it('sets pathsBasePath to the app tsconfig dir when baseUrl is inherited from an extended root tsconfig', async () => {
      // Monorepo scenario: root tsconfig defines baseUrl/paths, app tsconfig extends it.
      // The pathsBasePath must point to the *app* tsconfig dir so that rewritten
      // relative aliases (../../packages/...) resolve from the app, not the root.
      const rootTsConfigPath = join(tmpDir, 'tsconfig.base.json')
      await writeFile(
        rootTsConfigPath,
        JSON.stringify({
          compilerOptions: {
            baseUrl: '.',
            paths: {
              '@shared/*': ['./packages/shared/src/*'],
            },
          },
        }),
        { encoding: 'utf8' }
      )

      const appDir = join(tmpDir, 'apps', 'web')
      await mkdir(appDir, { recursive: true })
      const appTsConfigPath = join(appDir, 'tsconfig.json')
      await writeFile(
        appTsConfigPath,
        JSON.stringify({
          extends: '../../tsconfig.base.json',
          compilerOptions: {},
        }),
        { encoding: 'utf8' }
      )

      const result = await getTypeScriptConfiguration(ts, appTsConfigPath, true)

      expect(result.options.baseUrl).toBeUndefined()
      // Must be the app dir, not the root dir where tsconfig.base.json lives
      expect(result.options.pathsBasePath).toBe(dirname(appTsConfigPath))
    })
  })
})
