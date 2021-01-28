import { nextBuild, findPort, killApp, launchApp } from 'next-test-utils'
import { join } from 'path'
import fs from 'fs-extra'

jest.setTimeout(1000 * 60 * 3)
let app
let appPort

const appDir = join(__dirname, '../')
const indexPage = join(appDir, 'pages/index.js')
const indexPageBak = `${indexPage}.bak`

describe('no anonymous default export warning', () => {
  beforeAll(async () => {
    appPort = await findPort()
    app = await launchApp(appDir, appPort)
  })
  afterAll(() => killApp(app))

  it('should error for getStaticProps typos', async () => {
    const getStaticPropsPage = join(appDir, 'pages/getstaticprops.js.alt')
    await fs.move(indexPage, indexPageBak)
    await fs.move(getStaticPropsPage, indexPage)

    const { stderr, code } = await nextBuild(appDir, [], { stderr: true })

    await fs.move(indexPage, getStaticPropsPage)
    await fs.move(indexPageBak, indexPage)

    expect(code).toBe(1)
    expect(stderr).toContain('may be a typo. Did you mean getStaticProps?')
  })
  it('should error for getStaticPath typos', async () => {
    const getStaticPathsPage = join(appDir, 'pages/getstaticpaths.js.alt')
    await fs.move(indexPage, indexPageBak)
    await fs.move(getStaticPathsPage, indexPage)

    const { stderr, code } = await nextBuild(appDir, [], { stderr: true })

    await fs.move(indexPage, getStaticPathsPage)
    await fs.move(indexPageBak, indexPage)

    expect(code).toBe(1)
    expect(stderr).toContain('may be a typo. Did you mean getStaticPaths?')
  })
  it('should error for getServerSideProps typos', async () => {
    const getServerSidePropsPage = join(
      appDir,
      'pages/getserversideprops.js.alt'
    )
    await fs.move(indexPage, indexPageBak)
    await fs.move(getServerSidePropsPage, indexPage)

    const { stderr, code } = await nextBuild(appDir, [], { stderr: true })

    await fs.move(indexPage, getServerSidePropsPage)
    await fs.move(indexPageBak, indexPage)

    expect(code).toBe(1)
    expect(stderr).toContain('may be a typo. Did you mean getServerSideProps?')
  })
})
