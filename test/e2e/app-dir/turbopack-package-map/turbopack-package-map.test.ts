import execa from 'execa'
import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

// The package map is generated from the packages installed on the machine
// that runs the build.
// @force-gate turbopack && !deploy
describe('turbopack-package-map', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

  beforeAll(async () => {
    await execa('node', ['generate-package-map.mjs'], { cwd: next.testDir })
    await next.start()
  })

  it('should locate packages that are not in node_modules', async () => {
    const $ = await next.render$('/')
    // `store/greeting-1.0.0` depends on another version of `shared` than the
    // app does.
    expect($('#greeting').text()).toBe('greeting@1.0.0 with shared@1.0.0')
    expect($('#shared').text()).toBe('shared@2.0.0')
    expect($('#client').text()).toBe('client-lib@1.0.0')
  })

  it('should locate the packages of client components', async () => {
    const browser = await next.browser('/')
    await retry(async () => {
      expect(await browser.elementByCss('#client').text()).toBe(
        'hydrated client-lib@1.0.0'
      )
    })
  })

  // @force-gate dev
  it('should resolve again when the package map changes', async () => {
    const browser = await next.browser('/')
    expect(await browser.elementByCss('#shared').text()).toBe('shared@2.0.0')

    const packageMap = JSON.parse(await next.readFile('package-map.json'))
    const app = Object.values<{
      url: string
      dependencies: Record<string, string>
    }>(packageMap.packages).find((entry) => entry.url === '.')
    app.dependencies.shared = 'shared@1.0.0'
    await next.patchFile(
      'package-map.json',
      JSON.stringify(packageMap, null, 2),
      async () => {
        await retry(async () => {
          expect(await browser.elementByCss('#shared').text()).toBe(
            'shared@1.0.0'
          )
        })
      }
    )

    await retry(async () => {
      expect(await browser.elementByCss('#shared').text()).toBe('shared@2.0.0')
    })
  })

  // @force-gate dev
  it('should not resolve a package that is not a dependency of the importer', async () => {
    await next.patchFile(
      'app/undeclared/page.tsx',
      `import undeclared from 'undeclared'

export default function Page() {
  return <p>{undeclared}</p>
}
`,
      async () => {
        await retry(async () => {
          await next.fetch('/undeclared')
          expect(next.cliOutput).toContain("Can't resolve 'undeclared'")
          expect(next.cliOutput).toMatch(
            /Package map: "undeclared" is not in the dependencies of the importing package/
          )
        })
      }
    )
  })
})
