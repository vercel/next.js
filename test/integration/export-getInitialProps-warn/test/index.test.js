/* eslint-env jest */

import { join } from 'path'
import { nextBuild, nextExport } from 'next-test-utils'

const appDir = join(__dirname, '../')
const outdir = join(appDir, 'out')

describe('Export with getInitialProps', () => {
  it('should show warning with next export', async () => {
    await nextBuild(appDir)
    const { stderr } = await nextExport(appDir, { outdir }, { stderr: true })
    expect(stderr).toContain(
      'https://nextjs.org/docs/messages/get-initial-props-export'
    )
  })
})
