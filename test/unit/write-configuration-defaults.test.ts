/* eslint-env jest */
import os from 'os'
import fs from 'fs-extra'
import { join } from 'path'
import { writeConfigurationDefaults } from 'next/dist/lib/typescript/writeConfigurationDefaults'
import * as ts from 'typescript'

const fixtureDir = join(__dirname, 'fixtures/config-ts')
const tsconfigFile = join(fixtureDir, 'tsconfig.json')
const tsconfigBaseFile = join(fixtureDir, 'tsconfig.base.json')

describe('tsconfig.base.json', () => {
  beforeEach(async () => {
    await fs.ensureDir(fixtureDir)
  })
  afterEach(async () => {
    await fs.remove(tsconfigFile)
    await fs.remove(tsconfigBaseFile)
  })

  it('should support empty includes when base provides it', async () => {
    const content = {
      extends: './tsconfig.base.json',
    }

    const baseContent = {
      include: ['**/*.ts', '**/*.tsx'],
    }

    await fs.writeFile(tsconfigFile, JSON.stringify(content, null, 2))
    await fs.writeFile(tsconfigBaseFile, JSON.stringify(baseContent, null, 2))

    await expect(
      writeConfigurationDefaults(ts, tsconfigFile, false, true, '.next', true)
    ).resolves.not.toThrow()
  })

  it('should not add strictNullChecks if base provides it', async () => {
    const content = {
      extends: './tsconfig.base.json',
      compilerOptions: {
        plugins: [
          {
            name: 'next',
          },
        ],
      },
    }

    const baseContent = {
      compilerOptions: {
        strictNullChecks: true,
        strict: true,
      },
      include: ['next-env.d.ts', '**/*.ts', '**/*.tsx', '.next/types/**/*.ts'],
      exclude: ['node_modules'],
    }

    await fs.writeFile(tsconfigFile, JSON.stringify(content, null, 2))
    await fs.writeFile(tsconfigBaseFile, JSON.stringify(baseContent, null, 2))

    await writeConfigurationDefaults(
      ts,
      tsconfigFile,
      false,
      true,
      '.next',
      true
    )
    const output = await fs.readFile(tsconfigFile, 'utf8')
    const parsed = JSON.parse(output)

    expect(parsed.compilerOptions.strictNullChecks).toBeUndefined()
  })
})
