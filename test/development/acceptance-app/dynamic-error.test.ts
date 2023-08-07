/* eslint-env jest */
import { sandbox } from 'development-sandbox'
import { FileRef, nextTestSetup } from 'e2e-utils'
import path from 'path'
import { outdent } from 'outdent'

describe('dynamic = "error" in devmode', () => {
  const { next } = nextTestSetup({
    files: new FileRef(path.join(__dirname, 'fixtures', 'default-template')),
    skipStart: true,
  })

  it('should show error overlay when dynamic is forced', async () => {
    const { session, cleanup } = await sandbox(next, undefined, '/server')

    // dynamic = "error" and force dynamic
    await session.patch(
      'app/server/page.js',
      outdent`
        import { cookies } from 'next/headers';

        import Component from '../../index'

        export default function Page() {
          cookies()
          return <Component />
        }

        export const dynamic = "error"
      `
    )

    await session.hasRedbox(true)
    console.log(await session.getRedboxDescription())
    expect(await session.getRedboxDescription()).toBe(
      `Error: Page with \`dynamic = "error"\` couldn't be rendered statically because it used \`cookies\`.`
    )

    await cleanup()
  })
})
