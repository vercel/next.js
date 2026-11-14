import path from 'path'
import { nextTestSetup } from 'e2e-utils'

const report = process.report?.getReport?.() as
  | { header?: { glibcVersionRuntime?: string } }
  | undefined

const isGlibcLinux =
  process.platform === 'linux' &&
  Boolean(report?.header?.glibcVersionRuntime)

describe('build trace with native packages for another libc', () => {
  const { next, isNextStart, isTurbopack } = nextTestSetup({
    files: path.join(__dirname, 'app'),
    skipStart: true,
  })

  if (!isNextStart || isTurbopack || !isGlibcLinux) {
    it('skipped outside of a glibc Linux webpack build', () => {})
    return
  }

  it('traces the glibc build and leaves the musl builds out', async () => {
    const { exitCode } = await next.build()
    expect(exitCode).toBe(0)

    const indexTrace = JSON.parse(
      await next.readFile('.next/server/pages/index.js.nft.json')
    )
    const files: string[] = indexTrace.files

    expect(
      files.some((file) => file.includes('node_modules/fake-native/index.js'))
    ).toBe(true)
    expect(
      files.some((file) =>
        file.includes('node_modules/fake-native-linux-x64-gnu/index.js')
      )
    ).toBe(true)

    expect(files.some((file) => file.includes('-musl/'))).toBe(false)
    expect(files.some((file) => file.includes('-linuxmusl-'))).toBe(false)
  })
})
