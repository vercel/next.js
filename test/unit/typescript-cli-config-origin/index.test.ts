import {
  cpSync,
  mkdtempSync,
  mkdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { loadTsConfigOptions } from 'next/dist/lib/typescript/loadTsConfig'
import { getTypeScriptPackageInfo } from 'next/dist/lib/typescript/runTypeScriptCli'

describe('TypeScript CLI config metadata', () => {
  let testDir: string

  beforeEach(() => {
    testDir = mkdtempSync(path.join(tmpdir(), 'next-tsconfig-origin-'))
    cpSync(path.join(__dirname, 'fixture/project'), testDir, {
      recursive: true,
    })

    const packageDir = path.join(testDir, 'node_modules/@fixture/tsconfig')
    mkdirSync(path.dirname(packageDir), { recursive: true })
    cpSync(path.join(__dirname, 'fixture/tsconfig-package'), packageDir, {
      recursive: true,
    })
    cpSync(
      path.join(__dirname, 'fixture/default-tsconfig-package'),
      path.join(testDir, 'node_modules/@fixture/default-tsconfig'),
      { recursive: true }
    )
    cpSync(
      path.join(__dirname, 'fixture/typescript-esm-package'),
      path.join(testDir, 'node_modules/typescript'),
      { recursive: true }
    )
  })

  afterEach(() => {
    rmSync(testDir, { force: true, recursive: true })
  })

  it('uses the config selected by a package.json tsconfig field', () => {
    const options = loadTsConfigOptions(path.join(testDir, 'tsconfig.json'))

    expect(Array.from(options.paths?.['@fixture/*'] ?? [])).toEqual([
      'source/*',
    ])
    expect(options.pathsBasePath?.split(path.sep).slice(-4)).toEqual([
      'node_modules',
      '@fixture',
      'tsconfig',
      'configs',
    ])
    expect(options.baseUrl).toBeUndefined()
  })

  it('prefers a package tsconfig.json over its JSON main', () => {
    cpSync(
      path.join(__dirname, 'fixture/default-project/tsconfig.json'),
      path.join(testDir, 'tsconfig.json')
    )

    const options = loadTsConfigOptions(path.join(testDir, 'tsconfig.json'))

    expect(Array.from(options.paths?.['@default/*'] ?? [])).toEqual([
      'source/*',
    ])
    expect(options.pathsBasePath?.split(path.sep).slice(-3)).toEqual([
      'node_modules',
      '@fixture',
      'default-tsconfig',
    ])
  })

  it('expands inherited configDir templates from the root config', () => {
    const configPath = path.join(
      __dirname,
      'fixture/config-dir/project/tsconfig.json'
    )

    expect(loadTsConfigOptions(configPath).baseUrl).toBe(
      path.join(path.dirname(configPath), 'base')
    )
  })

  it('uses the JS entry behind an extensionless ESM tsc wrapper', () => {
    const packageInfo = getTypeScriptPackageInfo(testDir)

    expect(packageInfo).toMatchObject({
      version: '7.0.0-test',
      apiPath: undefined,
      tscPath: realpathSync(
        path.join(testDir, 'node_modules/typescript/lib/tsc.js')
      ),
    })
  })

  it('uses tsc6 from the official TypeScript 6 compatibility package', () => {
    const typescriptDir = path.join(testDir, 'node_modules/typescript')
    rmSync(typescriptDir, { force: true, recursive: true })
    cpSync(
      path.join(__dirname, 'fixture/typescript6-alias-package'),
      typescriptDir,
      { recursive: true }
    )

    expect(getTypeScriptPackageInfo(testDir)).toMatchObject({
      version: '6.0.2-test',
      apiPath: realpathSync(path.join(typescriptDir, 'lib/typescript.js')),
      tscPath: realpathSync(path.join(typescriptDir, 'bin/tsc6')),
    })
  })

  it('does not use tsc6 from an unrelated package', () => {
    const typescriptDir = path.join(testDir, 'node_modules/typescript')
    rmSync(typescriptDir, { force: true, recursive: true })
    cpSync(
      path.join(__dirname, 'fixture/typescript6-alias-package'),
      typescriptDir,
      { recursive: true }
    )
    writeFileSync(
      path.join(typescriptDir, 'package.json'),
      JSON.stringify({
        name: 'unrelated-typescript-package',
        version: '1.0.0-test',
        bin: { tsc6: './bin/tsc6' },
        main: './lib/typescript.js',
      })
    )

    expect(getTypeScriptPackageInfo(testDir)).toMatchObject({
      version: '1.0.0-test',
      apiPath: realpathSync(path.join(typescriptDir, 'lib/typescript.js')),
      tscPath: undefined,
    })
  })
})
