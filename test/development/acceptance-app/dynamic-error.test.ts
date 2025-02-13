/* eslint-env jest */
import { createSandbox } from 'development-sandbox'
import { FileRef, nextTestSetup } from 'e2e-utils'
import path from 'path'
import { outdent } from 'outdent'

describe('dynamic = "error" in devmode', () => {
  const { next } = nextTestSetup({
    files: new FileRef(path.join(__dirname, 'fixtures', 'default-template')),
  })

  it('should show error overlay when dynamic is forced', async () => {
    await using sandbox = await createSandbox(
      next,
      new Map([
        [
          'app/server/page.js',
          outdent`
          import { cookies } from 'next/headers';

          export default async function Page() {
            await cookies()
            return null
          }

          export const dynamic = "error"
        `,
        ],
      ]),
      '/server'
    )
    const { session } = sandbox
    await session.assertHasRedbox()
    const description = await session.getRedboxDescription()
    if (process.env.__NEXT_EXPERIMENTAL_NEW_DEV_OVERLAY === 'true') {
      expect(description).toMatchInlineSnapshot(
        `"Error: Route /server with \`dynamic = "error"\` couldn't be rendered statically because it used \`cookies\`. See more info here: https://nextjs.org/docs/app/building-your-application/rendering/static-and-dynamic#dynamic-rendering"`
      )
    } else {
      expect(description).toMatchInlineSnapshot(
        `"[ Server ] Error: Route /server with \`dynamic = "error"\` couldn't be rendered statically because it used \`cookies\`. See more info here: https://nextjs.org/docs/app/building-your-application/rendering/static-and-dynamic#dynamic-rendering"`
      )
    }
  })
})
