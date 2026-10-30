import path from 'path'
import { nextTestSetup } from 'e2e-utils'
import { check, renderViaHTTP, retry } from 'next-test-utils'
import stripAnsi from 'strip-ansi'

describe('typescript-auto-install', () => {
  const { next } = nextTestSetup({
    files: {
      'pages/index.js': `
        export default function Page() {
          return <p>hello world</p>
        }
      `,
    },
    env: {
      // unset CI env as this skips the auto-install behavior
      // being tested
      CI: '',
      CIRCLECI: '',
      GITHUB_ACTIONS: '',
      CONTINUOUS_INTEGRATION: '',
      RUN_ID: '',
      BUILD_NUMBER: '',
    },
    dependencies: {},
  })

  it('should work', async () => {
    const html = await renderViaHTTP(next.url, '/')
    expect(html).toContain('hello world')
  })

  it('should detect TypeScript being added and auto setup', async () => {
    const browser = await next.browser('/')
    const pageContent = await next.readFile('pages/index.js')

    await check(
      () => browser.eval('document.documentElement.innerHTML'),
      /hello world/
    )
    await next.renameFile('pages/index.js', 'pages/index.tsx')

    await check(
      () => stripAnsi(next.cliOutput),
      /We detected TypeScript in your project and created a tsconfig\.json file for you/i
    )

    await check(
      () => browser.eval('document.documentElement.innerHTML'),
      /hello world/
    )
    await next.patchFile(
      'pages/index.tsx',
      pageContent.replace('hello world', 'hello again')
    )

    await check(
      () => browser.eval('document.documentElement.innerHTML'),
      /hello again/
    )
  })
})

describe('typescript setup from a private unimported App helper', () => {
  const { next } = nextTestSetup({
    files: path.join(__dirname, 'private-helper'),
    dependencies: {
      typescript: 'latest',
      '@types/react': 'latest',
      '@types/node': 'latest',
    },
  })

  it('should enable TypeScript when a helper is added without changing any route', async () => {
    expect(await next.hasFile('tsconfig.json')).toBe(false)
    expect(await next.render('/')).toContain('JavaScript page')

    await next.patchFile(
      'app/_private/unimported.ts',
      'export const value: string = "not imported by a route"'
    )

    await retry(async () => {
      expect(await next.hasFile('tsconfig.json')).toBe(true)
      expect(await next.readFile('next-env.d.ts')).toContain(
        'reference types="next"'
      )
    })
    expect(await next.render('/')).toContain('JavaScript page')
    expect((await next.fetch('/_private/unimported')).status).toBe(404)
  })
})
