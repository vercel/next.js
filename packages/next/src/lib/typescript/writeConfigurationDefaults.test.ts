import { mkdtemp, writeFile, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
// eslint-disable-next-line import/no-extraneous-dependencies
import ts from 'typescript'
// eslint-disable-next-line import/no-extraneous-dependencies
import stripAnsi from 'strip-ansi'
import { writeConfigurationDefaults } from './writeConfigurationDefaults'

describe('writeConfigurationDefaults()', () => {
  let consoleLogSpy: jest.SpyInstance
  let distDir: string
  let hasAppDir: boolean
  let tmpDir: string
  let tsConfigPath: string
  let isFirstTimeSetup: boolean
  let hasPagesDir: boolean
  let isolatedDevBuild = true

  beforeEach(async () => {
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation()
    distDir = '.next'
    tmpDir = await mkdtemp(join(tmpdir(), 'nextjs-test-'))
    tsConfigPath = join(tmpDir, 'tsconfig.json')
    isFirstTimeSetup = false
  })

  afterEach(() => {
    consoleLogSpy.mockRestore()
  })

  describe('appDir', () => {
    beforeEach(() => {
      hasAppDir = true
      hasPagesDir = false
    })

    it('applies suggested and mandatory defaults to existing tsconfig.json and logs them', async () => {
      await writeFile(tsConfigPath, JSON.stringify({ compilerOptions: {} }), {
        encoding: 'utf8',
      })

      await writeConfigurationDefaults(
        ts.version,
        tsConfigPath,
        isFirstTimeSetup,
        hasAppDir,
        distDir,
        hasPagesDir,
        isolatedDevBuild
      )

      const tsConfig = JSON.parse(
        await readFile(tsConfigPath, { encoding: 'utf8' })
      )

      expect(tsConfig).toMatchInlineSnapshot(`
       {
         "compilerOptions": {
           "allowJs": true,
           "esModuleInterop": true,
           "incremental": true,
           "isolatedModules": true,
           "jsx": "react-jsx",
           "lib": [
             "dom",
             "dom.iterable",
             "esnext",
           ],
           "module": "esnext",
           "moduleResolution": "node",
           "noEmit": true,
           "plugins": [
             {
               "name": "next",
             },
           ],
           "resolveJsonModule": true,
           "skipLibCheck": true,
           "strict": false,
           "target": "ES2017",
         },
         "exclude": [
           "node_modules",
         ],
         "include": [
           "next-env.d.ts",
           ".next/types/**/*.ts",
           ".next/dev/types/**/*.ts",
           "**/*.mts",
           "**/*.ts",
           "**/*.tsx",
         ],
       }
      `)

      expect(stripAnsi(consoleLogSpy.mock.calls.flat().join('\n')))
        .toMatchInlineSnapshot(`
       "
          We detected TypeScript in your project and reconfigured your tsconfig.json file for you. Strict-mode is set to false by default.
          The following suggested values were added to your tsconfig.json. These values can be changed to fit your project's needs:

          	- target was set to ES2017 (For top-level \`await\`. Note: Next.js only polyfills for the esmodules target.)
          	- lib was set to dom,dom.iterable,esnext
          	- allowJs was set to true
          	- skipLibCheck was set to true
          	- strict was set to false
          	- noEmit was set to true
          	- incremental was set to true
          	- include was set to ['next-env.d.ts', '.next/types/**/*.ts', '.next/dev/types/**/*.ts', '**/*.mts', '**/*.ts', '**/*.tsx']
          	- plugins was updated to add { name: 'next' }
          	- exclude was set to ['node_modules']

          The following mandatory changes were made to your tsconfig.json:

          	- module was set to esnext (for dynamic import() support)
          	- esModuleInterop was set to true (requirement for SWC / babel)
          	- moduleResolution was set to node (to match webpack resolution)
          	- resolveJsonModule was set to true (to match webpack resolution)
          	- isolatedModules was set to true (requirement for SWC / Babel)
          	- jsx was set to react-jsx (next.js uses the React automatic runtime)
       "
      `)
    })

    it('does not warn about disabled strict mode if strict mode was already enabled', async () => {
      await writeFile(
        tsConfigPath,
        JSON.stringify({ compilerOptions: { strict: true } }),
        { encoding: 'utf8' }
      )

      await writeConfigurationDefaults(
        ts.version,
        tsConfigPath,
        isFirstTimeSetup,
        hasAppDir,
        distDir,
        hasPagesDir,
        isolatedDevBuild
      )

      expect(stripAnsi(consoleLogSpy.mock.calls.flat().join('\n'))).not.toMatch(
        'Strict-mode is set to false by default.'
      )
    })

    describe('with tsconfig extends', () => {
      let tsConfigBasePath: string
      let nextAppTypes: string

      beforeEach(() => {
        tsConfigBasePath = join(tmpDir, 'tsconfig.base.json')
        nextAppTypes = `${distDir}/types/**/*.ts`
      })

      it('should not change tsconfig with extends', async () => {
        const include = ['**/*.ts', '**/*.tsx', nextAppTypes, '**/*.mts']
        const content = { extends: './tsconfig.base.json' }
        const baseContent = { include }

        await writeFile(tsConfigPath, JSON.stringify(content, null, 2))
        await writeFile(tsConfigBasePath, JSON.stringify(baseContent, null, 2))

        await expect(
          writeConfigurationDefaults(
            ts.version,
            tsConfigPath,
            isFirstTimeSetup,
            hasAppDir,
            distDir,
            hasPagesDir,
            isolatedDevBuild
          )
        ).resolves.not.toThrow()

        const output = await readFile(tsConfigPath, 'utf-8')
        const parsed = JSON.parse(output)

        expect(parsed.include).toBeUndefined()
        expect(parsed).toStrictEqual({
          extends: './tsconfig.base.json',
        })
      })
    })

    // Test for Node16 module preservation
    it('should not change module field when it is set to node16', async () => {
      await writeFile(
        tsConfigPath,
        JSON.stringify({ compilerOptions: { module: 'node16' } }),
        { encoding: 'utf8' }
      )

      await writeConfigurationDefaults(
        ts,
        tsConfigPath,
        isFirstTimeSetup,
        hasAppDir,
        distDir,
        hasPagesDir
      )

      const tsConfig = await readFile(tsConfigPath, { encoding: 'utf8' })
      const parsed = JSON.parse(tsConfig)

      // The module field should remain as node16
      expect(parsed.compilerOptions.module).toBe('node16')

      // Verify that no warning about module change was logged
      const logs = consoleLogSpy.mock.calls
        .flat()
        .join('\n')
        // eslint-disable-next-line no-control-regex
        .replace(/\x1B\[\d+m/g, '')

      expect(logs).not.toContain('module was set to esnext')
    })

    // Test for Node20 module preservation/fallback based on TypeScript version
    it('should handle node20 module field based on TypeScript version', async () => {
      const hasNode20Support = (ts.ModuleKind as any).Node20 !== undefined

      await writeFile(
        tsConfigPath,
        JSON.stringify({ compilerOptions: { module: 'node20' } }),
        { encoding: 'utf8' }
      )

      await writeConfigurationDefaults(
        ts,
        tsConfigPath,
        isFirstTimeSetup,
        hasAppDir,
        distDir,
        hasPagesDir
      )

      const tsConfig = await readFile(tsConfigPath, { encoding: 'utf8' })
      const parsed = JSON.parse(tsConfig)

      const logs = consoleLogSpy.mock.calls
        .flat()
        .join('\n')
        // eslint-disable-next-line no-control-regex
        .replace(/\x1B\[\d+m/g, '')

      if (hasNode20Support) {
        // TypeScript 5.9+ - node20 should be preserved
        expect(parsed.compilerOptions.module).toBe('node20')
        expect(logs).not.toContain('module was set to esnext')
      } else {
        // TypeScript < 5.9 - node20 should be changed to esnext
        expect(parsed.compilerOptions.module).toBe('esnext')
        expect(logs).toContain('module was set to esnext')
      }
    })
  })
})
