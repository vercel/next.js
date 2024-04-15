/* eslint-env jest */

import { join } from 'path'
import { nextBuild } from 'next-test-utils'

const appDir = join(__dirname, '../')

describe('Export with getInitialProps', () => {
  ;(process.env.TURBOPACK_DEV ? describe.skip : describe)(
    'production mode',
    () => {
      it('should show warning with next export', async () => {
        const { stderr } = await nextBuild(appDir, [], { stderr: true })
        expect(stderr).toContain(
          'https://nextjs.org/docs/messages/get-initial-props-export'
        )
      })
    }
  )
})
