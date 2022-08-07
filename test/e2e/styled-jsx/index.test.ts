import path from 'path'
import { createNext, FileRef } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'
import { renderViaHTTP } from 'next-test-utils'

const appDir = path.join(__dirname, 'app')

function runTest(packageManager?: string) {
  describe(`styled-jsx with ${
    packageManager ? ' ' + packageManager : ''
  }`, () => {
    let next: NextInstance

    beforeAll(async () => {
      next = await createNext({
        files: {
          node_modules_bak: new FileRef(path.join(appDir, 'node_modules_bak')),
          pages: new FileRef(path.join(appDir, 'pages')),
          // 'next.config.js': new FileRef(path.join(appDir, 'next.config.js')),
        },
        packageJson: {
          scripts: {
            setup: `cp -r ./node_modules_bak/my-comps ./node_modules;`,
            build: `yarn setup && next build`,
            dev: `yarn setup && next dev`,
            start: 'next start',
          },
        },
        startCommand: 'yarn ' + ((global as any).isNextDev ? 'dev' : 'start'),
        buildCommand: `yarn build`,
        ...(packageManager
          ? {
              installCommand: `npx ${packageManager} install`,
            }
          : {}),
      })
    })
    afterAll(() => next.destroy())

    it('should contain styled-jsx styles in html', async () => {
      const html = await renderViaHTTP(next.url, '/')
      expect(html).toMatch(/color:(\s)*red/)
      // TODO: support styled-jsx from node-modules
      // expect(html).toMatch(/color:(\s)*cyan/)
    })
  })
}

runTest()
runTest('pnpm')
