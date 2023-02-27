/* eslint-env jest */
import { sandbox } from './helpers'
import { createNextDescribe } from 'e2e-utils'
import path from 'path'

createNextDescribe(
  'dynamic = "error" in devmode',
  {
    files: path.join(__dirname, 'fixtures', 'default-template'),
    skipStart: true,
  },
  ({ next }) => {
    it('should show error overlay when dynamic is forced', async () => {
      const { session, cleanup } = await sandbox(next, undefined, '/server')

      // dynamic = "error" and force dynamic
      await session.patch(
        'app/server/page.js',
        `
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
      expect(await session.getRedboxDescription()).toMatchInlineSnapshot(
        `"Error: Page with \`dynamic = \\"error\\"\` couldn't be rendered statically because it used \`cookies\`"`
      )

      await cleanup()
    })
  }
)
