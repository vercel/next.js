import { createNext } from 'e2e-utils'
import fs from 'fs'
import { waitFor } from 'next-test-utils'
import path from 'path'
import { NextInstance } from 'test/lib/next-modes/base'

describe('correct tsconfig.json defaults', () => {
  let next: NextInstance

  beforeAll(async () => {
    next = await createNext({
      files: {
        'pages/index.tsx': 'export default function Page() {}',
      },
      skipStart: true,
      dependencies: {
        typescript: 'latest',
        '@types/react': 'latest',
        '@types/node': 'latest',
      },
    })
  })
  afterAll(() => next.destroy())

  it('should add `moduleResolution` when generating tsconfig.json in dev', async () => {
    const tsconfigPath = path.join(next.testDir, 'tsconfig.json')
    expect(fs.existsSync(tsconfigPath)).toBeFalse()

    await next.start()
    await waitFor(1000)
    await next.stop()

    expect(fs.existsSync(tsconfigPath)).toBeTrue()

    const tsconfig = JSON.parse(await next.readFile('tsconfig.json'))
    expect(next.cliOutput).not.toContain('moduleResolution')

    expect(tsconfig.compilerOptions).toEqual(
      expect.objectContaining({ moduleResolution: 'node' })
    )
  })

  it('should not warn for `moduleResolution` when already present and valid', async () => {
    const tsconfigPath = path.join(next.testDir, 'tsconfig.json')
    expect(fs.existsSync(tsconfigPath)).toBeTrue()

    await next.start()
    await waitFor(1000)
    await next.stop()

    expect(fs.existsSync(tsconfigPath)).toBeTrue()

    const tsconfig = JSON.parse(await next.readFile('tsconfig.json'))

    expect(tsconfig.compilerOptions).toEqual(
      expect.objectContaining({ moduleResolution: 'node' })
    )
    expect(next.cliOutput).not.toContain('moduleResolution')
  })
})
