import { mkdtemp, writeFile, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
// eslint-disable-next-line import/no-extraneous-dependencies
import ts from 'typescript'
import { writeConfigurationDefaults } from './writeConfigurationDefaults'

describe('writeConfigurationDefaults()', () => {
  let consoleLogSpy: jest.SpyInstance
  let distDir: string
  let hasAppDir: boolean
  let tmpDir: string
  let tsConfigPath: string
  let isFirstTimeSetup: boolean
  let hasPagesDir: boolean

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
        ts,
        tsConfigPath,
        isFirstTimeSetup,
        hasAppDir,
        distDir,
        hasPagesDir
      )

      const tsConfig = await readFile(tsConfigPath, { encoding: 'utf8' })

      expect(JSON.parse(tsConfig)).toMatchInlineSnapshot(`
      {
        "compilerOptions": {
          "allowJs": true,
          "esModuleInterop": true,
          "incremental": true,
          "isolatedModules": true,
          "jsx": "preserve",
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
          "**/*.ts",
          "**/*.tsx",
        ],
      }
    `)

      expect(
        consoleLogSpy.mock.calls
          .flat()
          .join('\n')
          // eslint-disable-next-line no-control-regex
          .replace(/\x1B\[\d+m/g, '') // remove color control characters
      ).toMatchInlineSnapshot(`
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
           	- include was set to ['next-env.d.ts', '.next/types/**/*.ts', '**/*.ts', '**/*.tsx']
           	- plugins was updated to add { name: 'next' }
           	- exclude was set to ['node_modules']

           The following mandatory changes were made to your tsconfig.json:

           	- module was set to esnext (for dynamic import() support)
           	- esModuleInterop was set to true (requirement for SWC / babel)
           	- moduleResolution was set to node (to match webpack resolution)
           	- resolveJsonModule was set to true (to match webpack resolution)
           	- isolatedModules was set to true (requirement for SWC / Babel)
           	- jsx was set to preserve (next.js implements its own optimized jsx transform)
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
        ts,
        tsConfigPath,
        isFirstTimeSetup,
        hasAppDir,
        distDir,
        hasPagesDir
      )

      expect(
        consoleLogSpy.mock.calls
          .flat()
          .join('\n')
          // eslint-disable-next-line no-control-regex
          .replace(/\x1B\[\d+m/g, '') // remove color control characters
      ).not.toMatch('Strict-mode is set to false by default.')
    })

    describe('with tsconfig extends', () => {
      let tsConfigBasePath: string
      let nextAppTypes: string

      beforeEach(() => {
        tsConfigBasePath = join(tmpDir, 'tsconfig.base.json')
        nextAppTypes = `${distDir}/types/**/*.ts`
      })

      it('should support empty includes when base provides it', async () => {
        const include = ['**/*.ts', '**/*.tsx', nextAppTypes]
        const content = { extends: './tsconfig.base.json' }
        const baseContent = { include }

        await writeFile(tsConfigPath, JSON.stringify(content, null, 2))
        await writeFile(tsConfigBasePath, JSON.stringify(baseContent, null, 2))

        await expect(
          writeConfigurationDefaults(
            ts,
            tsConfigPath,
            isFirstTimeSetup,
            hasAppDir,
            distDir,
            hasPagesDir
          )
        ).resolves.not.toThrow()

        const output = await readFile(tsConfigPath, 'utf-8')
        const parsed = JSON.parse(output)

        expect(parsed.include).toBeUndefined()
      })

      it('should replace includes when base is missing appTypes', async () => {
        const include = ['**/*.ts', '**/*.tsx']
        const content = { extends: './tsconfig.base.json' }
        const baseContent = { include }

        await writeFile(tsConfigPath, JSON.stringify(content, null, 2))
        await writeFile(tsConfigBasePath, JSON.stringify(baseContent, null, 2))

        await expect(
          writeConfigurationDefaults(
            ts,
            tsConfigPath,
            isFirstTimeSetup,
            hasAppDir,
            distDir,
            hasPagesDir
          )
        ).resolves.not.toThrow()

        const output = await readFile(tsConfigPath, 'utf8')
        const parsed = JSON.parse(output)

        expect(parsed.include.sort()).toMatchInlineSnapshot(`
          [
            "**/*.ts",
            "**/*.tsx",
            ".next/types/**/*.ts",
          ]
        `)
      })

      it('should not add strictNullChecks if base provides it', async () => {
        const content = { extends: './tsconfig.base.json' }

        const baseContent = {
          compilerOptions: { strictNullChecks: true, strict: true },
        }

        await writeFile(tsConfigPath, JSON.stringify(content, null, 2))
        await writeFile(tsConfigBasePath, JSON.stringify(baseContent, null, 2))

        await writeConfigurationDefaults(
          ts,
          tsConfigPath,
          isFirstTimeSetup,
          hasAppDir,
          distDir,
          hasPagesDir
        )
        const output = await readFile(tsConfigPath, 'utf8')
        const parsed = JSON.parse(output)

        expect(parsed.compilerOptions.strictNullChecks).toBeUndefined()
      })
    })
  })
})
