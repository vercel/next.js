import { createNext } from 'e2e-utils'
import { NextInstance } from 'e2e-utils'

describe('escheck-output', () => {
  let next: NextInstance | undefined
  afterEach(() => next?.destroy())

  it('should downlevel JS according to manual browserslist with es2020', async () => {
    let browserslist = [
      'chrome 64',
      'edge 79',
      'firefox 67',
      'opera 51',
      'safari 12',
    ]
    next = await createNext({
      files: __dirname,
      dependencies: { 'es-check': '9.5.3' },
      packageJson: {
        browserslist,
        scripts: {
          build: 'next build && es-check es2020 ".next/static/**/*.js"',
        },
      },
      installCommand: 'pnpm i',
      buildCommand: 'pnpm build',
    })
    expect(next.cliOutput).toContain('info: ✓ ES-Check passed!')
  })

  it('should downlevel JS according to default browserslist', async () => {
    let browserslist = ['chrome 111', 'edge 111', 'firefox 111', 'safari 16.4']
    next = await createNext({
      files: __dirname,
      dependencies: { 'es-check': '9.5.3' },
      packageJson: {
        scripts: {
          build: `next build && es-check checkBrowser ".next/static/**/*.js" --browserslistQuery="${browserslist.join(', ')}"`,
        },
      },
      installCommand: 'pnpm i',
      buildCommand: 'pnpm build',
    })
    expect(next.cliOutput).toContain('info: ✓ ES-Check passed!')
  })
})
