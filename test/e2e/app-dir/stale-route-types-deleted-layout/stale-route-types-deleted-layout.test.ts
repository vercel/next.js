import { nextTestSetup } from 'e2e-utils'
import execa from 'execa'
import { retry } from 'next-test-utils'

// Type checking needs the locally generated `.next/dev/types`, so this suite
// only makes sense against a local dev server.
// @force-gate dev
describe('stale route types after deleting a layout', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('leaves generated route types importing a layout deleted while dev is stopped', async () => {
    // Route types are generated asynchronously once the dev server is up.
    await retry(async () => {
      expect(await next.readFile('.next/dev/types/validator.ts')).toContain(
        '(group)/layout'
      )
    })

    const beforeDelete = await execa('pnpm', ['tsc', '--noEmit'], {
      cwd: next.testDir,
      reject: false,
    })
    expect(beforeDelete.stdout + beforeDelete.stderr).toBe('')
    expect(beforeDelete.exitCode).toBe(0)

    await next.stop()
    await next.deleteFile('app/(group)/layout.tsx')

    // The generated validator still references the deleted layout, so the
    // user's own `tsc --noEmit` fails even though no application code changed.
    expect(await next.readFile('.next/dev/types/validator.ts')).toContain(
      '(group)/layout'
    )

    const afterDelete = await execa('pnpm', ['tsc', '--noEmit'], {
      cwd: next.testDir,
      reject: false,
    })

    // TODO: This documents current, incorrect behavior. Deleting a route should
    // not leave generated route types behind that fail the next typecheck. When
    // this is fixed, the typecheck should pass here instead.
    expect(afterDelete.exitCode).not.toBe(0)
    expect(afterDelete.stdout).toContain(
      "error TS2307: Cannot find module '../../../app/(group)/layout.js'"
    )
  })
})
