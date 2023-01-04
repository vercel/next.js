/* eslint-env jest */

import fs from 'fs-extra'
import { join } from 'path'
import { nextBuild, nextExport } from 'next-test-utils'

const appDir = join(__dirname, '../')
const outdir = join(appDir, 'out')

describe('Export index page with `notFound: true` in `getStaticProps`', () => {
  it('should build successfully', async () => {
    await fs.remove(join(appDir, '.next'))
    const { code } = await nextBuild(appDir)
    if (code !== 0) throw new Error(`build failed with status ${code}`)
  })

  it('should export successfully', async () => {
    const { code } = await nextExport(appDir, { outdir })
    if (code !== 0) throw new Error(`export failed with status ${code}`)
  })
})
