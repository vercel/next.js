/* eslint-env jest */

import fs from 'fs-extra'
import { join } from 'path'
import { nextBuild } from 'next-test-utils'
import { SERVER_PROPS_SSG_CONFLICT } from 'next/dist/lib/constants'

jest.setTimeout(1000 * 60 * 1)
const appDir = join(__dirname, '..')
const indexPage = join(appDir, 'pages/index.js')
const indexPageAlt = `${indexPage}.alt`
const indexPageBak = `${indexPage}.bak`

describe('Mixed getStaticProps and getServerSideProps error', () => {
  it('should error when exporting both getStaticProps and getServerSideProps', async () => {
    const { stderr } = await nextBuild(appDir, [], { stderr: true })
    expect(stderr).toContain(SERVER_PROPS_SSG_CONFLICT)
  })

  it('should error when exporting both getStaticPaths and getServerSideProps', async () => {
    await fs.move(indexPage, indexPageBak)
    await fs.move(indexPageAlt, indexPage)

    const { stderr, code } = await nextBuild(appDir, [], { stderr: true })

    await fs.move(indexPage, indexPageAlt)
    await fs.move(indexPageBak, indexPage)

    expect(code).toBe(1)
    expect(stderr).toContain(SERVER_PROPS_SSG_CONFLICT)
  })
})
