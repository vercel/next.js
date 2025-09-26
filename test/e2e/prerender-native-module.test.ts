import path from 'path'
import { createNext, FileRef } from 'e2e-utils'
import { NextInstance } from 'e2e-utils'
import webdriver from 'next-webdriver'

const isReact18 = parseInt(process.env.NEXT_TEST_REACT_VERSION) === 18

describe('prerender native module', () => {
  let next: NextInstance

  beforeAll(async () => {
    next = await createNext({
      files: {
        pages: new FileRef(
          path.join(__dirname, 'prerender-native-module/pages')
        ),
        'data.sqlite': new FileRef(
          path.join(__dirname, 'prerender-native-module/data.sqlite')
        ),
      },
      dependencies: {
        sqlite: '4.0.22',
        sqlite3: '5.0.2',
      },
      packageJson: {
        pnpm: {
          onlyBuiltDependencies: ['sqlite3'],
        },
      },
    })
  })
  afterAll(() => next.destroy())

  it('should render index correctly', async () => {
    const browser = await webdriver(next.url, '/')
    expect(await browser.elementByCss('#index').text()).toBe('index page')
    expect(JSON.parse(await browser.elementByCss('#props').text())).toEqual({
      index: true,
    })
  })

  it('should render /blog/first correctly', async () => {
    const browser = await webdriver(next.url, '/blog/first')

    expect(await browser.elementByCss('#blog').text()).toBe('blog page')
    expect(JSON.parse(await browser.elementByCss('#props').text())).toEqual({
      params: { slug: 'first' },
      blog: true,
      users: [
        { id: 1, first_name: 'john', last_name: 'deux' },
        { id: 2, first_name: 'zeit', last_name: 'geist' },
      ],
    })
  })

  it('should render /blog/second correctly', async () => {
    const browser = await webdriver(next.url, '/blog/second')
    await browser.waitForElementByCss('#blog')

    expect(await browser.elementByCss('#blog').text()).toBe('blog page')
    expect(JSON.parse(await browser.elementByCss('#props').text())).toEqual({
      params: { slug: 'second' },
      blog: true,
      users: [
        { id: 1, first_name: 'john', last_name: 'deux' },
        { id: 2, first_name: 'zeit', last_name: 'geist' },
      ],
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
          notTests: [],
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
            /node_modules\/sqlite3\/.*?\.js/,
            /node_modules\/sqlite3\/.*?\.node/,
            /node_modules\/sqlite\/.*?\.js/,
            /node_modules\/next/,
            /\/data\.sqlite/,
          ],
          notTests: [],
        },
      ]

      for (const check of checks) {
        const contents = await next.readFile(
          path.join('.next/server/pages/', check.page + '.js.nft.json')
        )
        const { version, files } = JSON.parse(contents)
        expect(version).toBe(1)
        expect(
          check.tests.every((item) => files.some((file) => item.test(file)))
        ).toBe(true)

        if (path.sep === '/') {
          expect(
            check.notTests.some((item) => files.some((file) => item.test(file)))
          ).toBe(false)
        }
      }
    })
  }
})
