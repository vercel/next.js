/* eslint-env jest */
import { spawnSync } from 'child_process'
import { mkdtemp, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { transform } from 'next/dist/build/swc'
import { installBindings } from 'next/dist/build/swc/install-bindings'
import { getJestSWCOptions } from 'next/dist/build/swc/options'

describe('next/jest import attributes', () => {
  let directory: string

  beforeAll(async () => {
    await installBindings()
    directory = await mkdtemp(join(tmpdir(), 'next-jest-import-attributes-'))
  })

  afterAll(async () => {
    await rm(directory, { recursive: true, force: true })
  })

  it('should emit an ESM import with attributes that the current Node.js can load', async () => {
    const filename = join(directory, 'index.mjs')
    const { code } = await transform(
      `import data from './data.json' with { type: 'json' }\nconsole.log(data.answer)`,
      {
        ...getJestSWCOptions({
          isServer: true,
          filename,
          esm: true,
          swcPlugins: undefined,
          compilerOptions: undefined,
          jsConfig: {},
          serverReferenceHashSalt: '',
        }),
        filename,
      }
    )
    await writeFile(join(directory, 'data.json'), '{ "answer": 42 }')
    await writeFile(filename, code)

    const result = spawnSync(process.execPath, [filename], {
      encoding: 'utf8',
    })
    expect(result.stderr).not.toContain('SyntaxError')
    expect(result.stdout).toBe('42\n')
  })
})
