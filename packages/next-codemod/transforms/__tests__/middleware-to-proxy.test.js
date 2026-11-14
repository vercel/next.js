/* global jest */
jest.autoMockOff()
const defineTest = require('jscodeshift/dist/testUtils').defineTest
const { readdirSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } = require('fs')
const { join } = require('path')
const { tmpdir } = require('os')

const fixtureDir = 'middleware-to-proxy'
const fixtureDirPath = join(__dirname, '..', '__testfixtures__', fixtureDir)
const fixtures = readdirSync(fixtureDirPath)
  .filter(file => file.endsWith('.input.ts'))
  .map(file => file.replace('.input.ts', ''))

for (const fixture of fixtures) {
  const prefix = `${fixtureDir}/${fixture}`
  defineTest(__dirname, fixtureDir, null, prefix, { parser: 'ts' })
}

describe('middleware-to-proxy file rename', () => {
  let originalNodeEnv
  let testDir

  beforeEach(() => {
    originalNodeEnv = process.env.NODE_ENV
    // Force the real rename path (skipped when NODE_ENV === 'test').
    process.env.NODE_ENV = 'production'
    testDir = join(
      tmpdir(),
      `middleware-to-proxy-rename-${Date.now()}-${(Math.random() * 1000) | 0}`
    )
    mkdirSync(testDir, { recursive: true })
    // Re-require so the transform sees the updated NODE_ENV for path checks.
    jest.resetModules()
  })

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv
    if (testDir && existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true })
    }
  })

  it('renames middleware.ts to proxy.ts when no content changes are needed', () => {
    const transformer = require('../middleware-to-proxy').default
    const middlewarePath = join(testDir, 'middleware.ts')
    const source = `export { auth as default } from "./auth";

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
`
    writeFileSync(middlewarePath, source)

    const result = transformer({ path: middlewarePath, source }, {})

    expect(result).toBe('')
    expect(existsSync(middlewarePath)).toBe(false)
    expect(existsSync(join(testDir, 'proxy.ts'))).toBe(true)
    expect(readFileSync(join(testDir, 'proxy.ts'), 'utf8')).toBe(source)
  })

  it('renames middleware.ts to proxy.ts when content is transformed', () => {
    const transformer = require('../middleware-to-proxy').default
    const middlewarePath = join(testDir, 'middleware.ts')
    const source = `export function middleware() {
  return Response.next()
}
`
    writeFileSync(middlewarePath, source)

    const result = transformer({ path: middlewarePath, source }, {})

    expect(result).toBe('')
    expect(existsSync(middlewarePath)).toBe(false)
    expect(existsSync(join(testDir, 'proxy.ts'))).toBe(true)
    expect(readFileSync(join(testDir, 'proxy.ts'), 'utf8')).toContain(
      'export function proxy()'
    )
  })
})