import path from 'path'
import { isReact18, nextTestSetup } from 'e2e-utils'

const fixture = path.join(__dirname, 'prerender-native-module')

const expectedUsers = [
  { id: 1, first_name: 'john', last_name: 'deux' },
  { id: 2, first_name: 'zeit', last_name: 'geist' },
]

describe('prerender native module', () => {
  const { next } = nextTestSetup({
    files: fixture,
    // `bindings` is a direct dependency rather than one of `native-addon`. The
    // addon resolves it by walking up from the virtual store, and declaring it on
    // the addon would make it a non-registry transitive dependency, which
    // `blockExoticSubdeps` rejects.
    //
    // These use `file:` rather than `link:` so pnpm copies them into the virtual
    // store. A linked package resolves to a path inside the app, which the bundler
    // treats as app code and tries to bundle, and `bindings` contains a `require`
    // it cannot resolve statically.
    dependencies: require('./prerender-native-module/package.json')
      .dependencies,
  })

  it('should render index correctly', async () => {
    const browser = await next.browser('/')
    expect(await browser.elementByCss('#index').text()).toBe('index page')
    expect(JSON.parse(await browser.elementByCss('#props').text())).toEqual({
      index: true,
    })
  })

  it('should render /blog/first correctly', async () => {
    const browser = await next.browser('/blog/first')

    expect(await browser.elementByCss('#blog').text()).toBe('blog page')
    expect(JSON.parse(await browser.elementByCss('#props').text())).toEqual({
      params: { slug: 'first' },
      blog: true,
      contextAware: true,
      users: expectedUsers,
    })
  })

  it('should render /blog/second correctly', async () => {
    const browser = await next.browser('/blog/second')
    await browser.waitForElementByCss('#blog')

    expect(await browser.elementByCss('#blog').text()).toBe('blog page')
    expect(JSON.parse(await browser.elementByCss('#props').text())).toEqual({
      params: { slug: 'second' },
      blog: true,
      contextAware: true,
      users: expectedUsers,
    })
  })

  if ((global as any).isNextStart) {
    it('should output traces', async () => {
      const checks = [
        {
          page: '/_app',
          tests: [
            /(webpack-runtime\.js|\[turbopack\]_runtime\.js)/,
            /node_modules\/react\/index\.js/,
            /node_modules\/react\/package\.json/,
            isReact18
              ? /node_modules\/react\/cjs\/react\.production\.min\.js/
              : /node_modules\/react\/cjs\/react\.production\.js/,
          ],
        },
        {
          page: '/blog/[slug]',
          tests: [
            /(webpack-runtime\.js|\[turbopack\]_runtime\.js)/,
            /node_modules\/react\/index\.js/,
            /node_modules\/react\/package\.json/,
            isReact18
              ? /node_modules\/react\/cjs\/react\.production\.min\.js/
              : /node_modules\/react\/cjs\/react\.production\.js/,
            // The addon's JS entry, and the binary it locates through
            // `require('bindings')(...)`.
            /node_modules\/native-addon\/.*?\.js/,
            /node_modules\/native-addon\/.*?\.node/,
            // The pure-JS wrapper layered on top of it.
            /node_modules\/native-addon-wrapper\/.*?\.js/,
            /node_modules\/next/,
            // Reached only by statically evaluating `path.join(process.cwd(), ...)`.
            /\/users\.json/,
          ],
        },
      ]

      for (const check of checks) {
        const contents = await next.readFile(
          path.join('.next/server/pages/', check.page + '.js.nft.json')
        )
        const { version, files } = JSON.parse(contents)
        expect(version).toBe(1)

        for (const test of check.tests) {
          expect(files).toEqual(
            expect.arrayContaining([expect.stringMatching(test)])
          )
        }
      }
    })
  }
})
