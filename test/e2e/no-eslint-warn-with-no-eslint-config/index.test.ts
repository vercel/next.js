import { createNext } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'
import { renderViaHTTP } from 'next-test-utils'

describe('no-eslint-warn-with-no-eslint-config', () => {
  let next: NextInstance

  if ((global as any).isNextDeploy) {
    it('should skip for deploy', () => {})
    return
  }

  beforeAll(async () => {
    next = await createNext({
      files: {
        'pages/index.js': `
          export default function Page() { 
            return <p>hello world</p>
          } 
        `,
      },
      dependencies: {},
    })
  })
  afterAll(() => next.destroy())

  it('should render', async () => {
    const html = await renderViaHTTP(next.url, '/')
    expect(html).toContain('hello world')
  })

  it('should not have eslint warnings when no eslint config', async () => {
    expect(next.cliOutput).not.toContain(
      'No ESLint configuration detected. Run next lint to begin setup'
    )
    expect(next.cliOutput).not.toBe('warn')
  })

  if (!(global as any).isNextDev) {
    it('should warn with empty eslintrc', async () => {
      await next.stop()
      await next.patchFile('.eslintrc.json', '{}')
      await next.start()

      expect(next.cliOutput).toContain(
        'No ESLint configuration detected. Run next lint to begin setup'
      )
    })

    it('should warn with empty eslint config in package.json', async () => {
      await next.stop()
      await next.deleteFile('.eslintrc.json')
      const origPkgJson = await next.readFile('package.json')
      const pkgJson = JSON.parse(origPkgJson)
      pkgJson.eslintConfig = {}

      try {
        await next.patchFile('package.json', JSON.stringify(pkgJson))
        await next.start()

        expect(next.cliOutput).toContain(
          'No ESLint configuration detected. Run next lint to begin setup'
        )
      } finally {
        await next.patchFile('package.json', origPkgJson)
      }
    })

    it('should not warn with eslint config in package.json', async () => {
      await next.stop()
      const origPkgJson = await next.readFile('package.json')
      const pkgJson = JSON.parse(origPkgJson)
      pkgJson.eslintConfig = { rules: { semi: 'off' } }

      try {
        await next.patchFile('package.json', JSON.stringify(pkgJson))
        await next.start()

        expect(next.cliOutput).not.toContain(
          'No ESLint configuration detected. Run next lint to begin setup'
        )
      } finally {
        await next.patchFile('package.json', origPkgJson)
      }
    })
  }
})
