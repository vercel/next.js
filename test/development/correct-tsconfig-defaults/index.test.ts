import { createNext } from 'e2e-utils'
import { check } from 'next-test-utils'
import { NextInstance } from 'test/lib/next-modes/base'
// @ts-expect-error missing types
import stripAnsi from 'strip-ansi'

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
    try {
      expect(
        await next.readFile('tsconfig.json').catch(() => false)
      ).toBeFalse()

      await next.start()

      // wait for tsconfig to be written
      await check(async () => {
        await next.readFile('tsconfig.json')
        return 'success'
      }, 'success')

      const tsconfig = JSON.parse(await next.readFile('tsconfig.json'))
      expect(next.cliOutput).not.toContain('moduleResolution')

      expect(tsconfig.compilerOptions).toEqual(
        expect.objectContaining({ moduleResolution: 'node' })
      )
    } finally {
      await next.stop()
    }
  })

  it('should not warn for `moduleResolution` when already present and valid', async () => {
    try {
      expect(
        await next.readFile('tsconfig.json').catch(() => false)
      ).toBeTruthy()

      await next.start()

      const tsconfig = JSON.parse(await next.readFile('tsconfig.json'))

      expect(tsconfig.compilerOptions).toEqual(
        expect.objectContaining({ moduleResolution: 'node' })
      )
      expect(next.cliOutput).not.toContain('moduleResolution')
    } finally {
      await next.stop()
    }
  })

  it('should not warn if `target` is unchanged', async () => {
    try {
      expect(
        await next.readFile('tsconfig.json').catch(() => false)
      ).toBeTruthy()

      await next.start()

      // Wait until compilation is done
      await check(() => stripAnsi(next.cliOutput), /compiled client/i)

      expect(next.cliOutput).not.toContain('tsconfig-target-option')
    } finally {
      await next.stop()
    }
  })

  it('should warn if `target` is changed', async () => {
    try {
      expect(
        await next.readFile('tsconfig.json').catch(() => false)
      ).toBeTruthy()

      // Change target option to a non-default value
      const tsconfig = JSON.parse(await next.readFile('tsconfig.json'))
      tsconfig.compilerOptions.target = 'ES2022'
      await next.patchFile('tsconfig.json', JSON.stringify(tsconfig))

      await next.start()

      // Wait until compilation is done
      await check(() => stripAnsi(next.cliOutput), /compiled client/i)

      expect(next.cliOutput).toContain('tsconfig-target-option')
    } finally {
      await next.stop()
    }
  })
})
