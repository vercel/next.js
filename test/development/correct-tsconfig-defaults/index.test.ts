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
        typescript: '4.7.4',
        '@types/react': '18.0.15',
      },
    })
  })
  afterAll(() => next.destroy())

  it('should add `moduleResoution` when generating tsconfig.json in dev', async () => {
    const tsconfigPath = path.join(next.testDir, 'tsconfig.json')
    expect(fs.existsSync(tsconfigPath)).toBeFalse()

    await next.start()
    await waitFor(1000)
    await next.stop()

    expect(fs.existsSync(tsconfigPath)).toBeTrue()

    const tsconfig = JSON.parse(await next.readFile('tsconfig.json'))

    expect(tsconfig.compilerOptions).toEqual(
      expect.objectContaining({ moduleResolution: 'node' })
    )
  })
})
