/* eslint-env jest */

import fs from 'fs-extra'
import { join } from 'path'
import { nextBuild } from 'next-test-utils'

const appDir = join(__dirname, '..')
const indexPage = join(appDir, 'pages/index.js')
let origIndexPage = ''

const runTests = () => {
  it('should error when legacy unstable_getStaticProps', async () => {
    const { stderr, code } = await nextBuild(appDir, [], { stderr: true })
    expect(code).toBe(1)
    expect(stderr).toContain(
      `unstable_getStaticProps was replaced with getStaticProps. Please update your code.`
    )
  })

  it('should error when legacy unstable_getServerProps', async () => {
    await fs.writeFile(
      indexPage,
      origIndexPage.replace('getStaticProps', 'getServerProps')
    )

    const { stderr, code } = await nextBuild(appDir, [], { stderr: true })

    expect(code).toBe(1)
    expect(stderr).toContain(
      `unstable_getServerProps was replaced with getServerSideProps. Please update your code.`
    )
  })

  it('should error when legacy unstable_getStaticPaths', async () => {
    await fs.writeFile(
      indexPage,
      origIndexPage.replace('getStaticProps', 'getStaticPaths')
    )

    const { stderr, code } = await nextBuild(appDir, [], { stderr: true })

    expect(code).toBe(1)
    expect(stderr).toContain(
      `unstable_getStaticPaths was replaced with getStaticPaths. Please update your code.`
    )
  })
}

describe('Mixed getStaticProps and getServerSideProps error', () => {
  beforeAll(async () => {
    origIndexPage = await fs.readFile(indexPage, 'utf8')
  })
  afterEach(() => fs.writeFile(indexPage, origIndexPage))

  describe('server mode', () => {
    runTests(false)
  })
})
