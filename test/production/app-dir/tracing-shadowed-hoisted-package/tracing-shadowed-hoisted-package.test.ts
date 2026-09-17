import { nextTestSetup } from 'e2e-utils'

// `node_modules/.store` in this fixture mirrors the virtual store pnpm creates as
// `node_modules/.pnpm`. Two copies of `dep` live in it, and `pkg` can reach both: through the
// link in its own `node_modules`, which resolution finds first, and through the hoisted link
// one directory up, which it never reaches. Only the first belongs in the file trace. Listing
// the second one packs a link into a copy of `dep` whose files are not traced, which in a
// deployment leaves a symlink with nothing on the other end.
describe('tracing-shadowed-hoisted-package', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

  if (skipped) {
    return
  }

  it('should trace only the copy of a package that resolution uses', async () => {
    const { exitCode } = await next.build()
    expect(exitCode).toBe(0)

    const { files } = await next.readJSON('.next/server/app/page.js.nft.json')

    expect(files).toContainEqual(
      expect.stringMatching(
        /node_modules\/\.store\/pkg@1\.0\.0\/node_modules\/dep$/
      )
    )
    expect(files).toContainEqual(
      expect.stringMatching(
        /node_modules\/\.store\/dep@1\.0\.0\/node_modules\/dep\/index\.js$/
      )
    )

    expect(files).not.toContainEqual(
      expect.stringMatching(/node_modules\/\.store\/node_modules\/dep$/)
    )
    expect(files).not.toContainEqual(
      expect.stringMatching(/node_modules\/\.store\/dep@2\.0\.0\//)
    )
  })
})
