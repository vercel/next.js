import { createNext } from 'e2e-utils'
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

  it('should add `moduleResoution` when generating tsconfig.json', async () => {
    await next.start()
    await next.stop()

    const tsconfig = JSON.parse(await next.readFile('tsconfig.json'))

    expect(tsconfig.compilerOptions).toEqual(
      expect.objectContaining({ moduleResolution: 'node' })
    )
  })
})
