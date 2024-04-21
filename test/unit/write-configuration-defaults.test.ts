/* eslint-env jest */
import fs from 'fs-extra'
import { join } from 'path'
import { writeConfigurationDefaults } from 'next/dist/lib/typescript/writeConfigurationDefaults'
import * as ts from 'typescript'

const fixtureDir = join(__dirname, 'fixtures/config-ts')
const tsconfigFile = join(fixtureDir, 'tsconfig.json')
const tsconfigBaseFile = join(fixtureDir, 'tsconfig.base.json')
const distDir = '.next'
const nextAppTypes = `${distDir}/types/**/*.ts`

describe('tsconfig.base.json', () => {
  beforeEach(async () => {
    await fs.ensureDir(fixtureDir)
  })
  afterEach(async () => {
    await fs.remove(tsconfigFile)
    await fs.remove(tsconfigBaseFile)
  })

  describe('appDir', () => {
    it('should support empty includes when base provides it', async () => {
      const include = ['**/*.ts', '**/*.tsx', nextAppTypes]
      const content = {
        extends: './tsconfig.base.json',
      }
      const baseContent = {
        include,
      }

      await fs.writeFile(tsconfigFile, JSON.stringify(content, null, 2))
      await fs.writeFile(tsconfigBaseFile, JSON.stringify(baseContent, null, 2))

      await expect(
        writeConfigurationDefaults(ts, tsconfigFile, false, true, distDir, true)
      ).resolves.not.toThrow()

      const output = await fs.readFile(tsconfigFile, 'utf8')
      const parsed = JSON.parse(output)

      expect(parsed.include).toBeUndefined()
    })

    it('should replace includes when base is missing appTypes', async () => {
      const include = ['**/*.ts', '**/*.tsx']
      const content = {
        extends: './tsconfig.base.json',
      }
      const baseContent = {
        include,
      }

      await fs.writeFile(tsconfigFile, JSON.stringify(content, null, 2))
      await fs.writeFile(tsconfigBaseFile, JSON.stringify(baseContent, null, 2))

      await expect(
        writeConfigurationDefaults(ts, tsconfigFile, false, true, distDir, true)
      ).resolves.not.toThrow()

      const output = await fs.readFile(tsconfigFile, 'utf8')
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
      const content = {
        extends: './tsconfig.base.json',
      }

      const baseContent = {
        compilerOptions: {
          strictNullChecks: true,
          strict: true,
        },
      }

      await fs.writeFile(tsconfigFile, JSON.stringify(content, null, 2))
      await fs.writeFile(tsconfigBaseFile, JSON.stringify(baseContent, null, 2))

      await writeConfigurationDefaults(
        ts,
        tsconfigFile,
        false,
        true,
        distDir,
        true
      )
      const output = await fs.readFile(tsconfigFile, 'utf8')
      const parsed = JSON.parse(output)

      expect(parsed.compilerOptions.strictNullChecks).toBeUndefined()
    })
  })
})
