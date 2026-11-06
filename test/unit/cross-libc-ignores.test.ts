import { getCrossLibcIgnores } from 'next/dist/build/cross-libc-ignores'
import picomatch from 'next/dist/compiled/picomatch'

const originalPlatform = process.platform
const originalReport = process.report

function setHost({ platform, musl }: { platform: string; musl?: boolean }) {
  Object.defineProperty(process, 'platform', {
    value: platform,
    configurable: true,
  })
  Object.defineProperty(process, 'report', {
    value: {
      getReport: () => ({
        header: musl ? {} : { glibcVersionRuntime: '2.34' },
      }),
    },
    configurable: true,
  })
}

afterEach(() => {
  Object.defineProperty(process, 'platform', {
    value: originalPlatform,
    configurable: true,
  })
  Object.defineProperty(process, 'report', {
    value: originalReport,
    configurable: true,
  })
})

describe('getCrossLibcIgnores', () => {
  it('ignores musl builds when building on Linux with glibc', () => {
    setHost({ platform: 'linux' })
    expect(getCrossLibcIgnores()).not.toHaveLength(0)
  })

  it('ignores nothing when building on Linux with musl', () => {
    setHost({ platform: 'linux', musl: true })
    expect(getCrossLibcIgnores()).toEqual([])
  })

  it.each(['darwin', 'win32'])(
    'ignores nothing on %s, where the target libc is unknown',
    (platform) => {
      setHost({ platform })
      expect(getCrossLibcIgnores()).toEqual([])
    }
  )
})

describe('the globs returned on a glibc Linux host', () => {
  // Matches how `makeIgnoreFn` in collect-build-traces compiles them.
  const isIgnored = (file: string) => {
    setHost({ platform: 'linux' })
    return picomatch(getCrossLibcIgnores(), { contains: true, dot: true })(file)
  }

  it.each([
    'node_modules/@swc/core-linux-x64-musl/swc.linux-x64-musl.node',
    'node_modules/@swc/core-linux-arm64-musl/swc.linux-arm64-musl.node',
    'node_modules/@img/sharp-linuxmusl-x64/lib/sharp-linuxmusl-x64.node',
    'node_modules/@img/sharp-libvips-linuxmusl-x64/lib/libvips-cpp.so.42',
    '../../node_modules/@img/sharp-linuxmusl-arm64/package.json',
  ])('ignores %s', (file) => {
    expect(isIgnored(file)).toBe(true)
  })

  it.each([
    'node_modules/@swc/core-linux-x64-gnu/swc.linux-x64-gnu.node',
    'node_modules/@img/sharp-linux-x64/lib/sharp-linux-x64.node',
    'node_modules/@img/sharp-libvips-linux-x64/lib/libvips-cpp.so.42',
    'node_modules/sharp/lib/index.js',
    'node_modules/my-linux-tools-muslin/index.js',
  ])('keeps %s', (file) => {
    expect(isIgnored(file)).toBe(false)
  })
})
