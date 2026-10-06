/* global jest */
jest.autoMockOff()
const defineTest = require('jscodeshift/dist/testUtils').defineTest
const { readdirSync, readFileSync } = require('fs')
const { join } = require('path')
const transformer = require('../cache-components-instant-false').default

const fixtureDir = 'cache-components-instant-false'
const fixtureDirPath = join(__dirname, '..', '__testfixtures__', fixtureDir)
const fixtures = readdirSync(fixtureDirPath)
  .filter((file) => file.endsWith('.input.tsx'))
  .map((file) => file.replace('.input.tsx', ''))

for (const fixture of fixtures) {
  const prefix = `${fixtureDir}/${fixture}`
  defineTest(__dirname, fixtureDir, null, prefix, { parser: 'tsx' })
}

describe('file paths', () => {
  const source = readFileSync(
    join(fixtureDirPath, 'basic-page.input.tsx'),
    'utf8'
  )
  const expected = readFileSync(
    join(fixtureDirPath, 'basic-page.output.tsx'),
    'utf8'
  )

  beforeEach(() => {
    // Exercise the path filter that fixture tests normally bypass.
    jest.replaceProperty(process, 'env', {
      ...process.env,
      NODE_ENV: 'production',
    })
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it.each([
    'app/page.tsx',
    'app/layout.tsx',
    'app/default.tsx',
    'app/blog/page.ext.tsx',
    // Compound extensions are accepted without consulting pageExtensions.
    'app/page.test.tsx',
    '/project/src/app/blog/page.jsx',
    'C:\\project\\src\\app\\blog\\page.tsx',
  ])('transforms route segment %s', (path) => {
    expect(
      transformer({ path, source }, {}).replace(/\r\n/g, '\n').trim()
    ).toBe(expected.replace(/\r\n/g, '\n').trim())
  })

  it.each([
    'app/_lib/custom-layout.ts',
    'app/components/homepage.tsx',
    'app/components/custom-default.tsx',
    'app/blog/route.ts',
    'pages/page.tsx',
    'my-app/page.tsx',
    'C:\\project\\app\\_lib\\custom-layout.ts',
  ])('leaves non-segment file %s unchanged', (path) => {
    expect(transformer({ path, source }, {})).toBe(source)
  })
})
