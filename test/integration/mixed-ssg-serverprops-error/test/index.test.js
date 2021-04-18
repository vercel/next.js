/* eslint-env jest */

import fs from 'fs-extra'
import { join } from 'path'
import { nextBuild } from 'next-test-utils'
import { SERVER_PROPS_SSG_CONFLICT } from 'next/dist/lib/constants'

jest.setTimeout(1000 * 60 * 2)

const appDir = join(__dirname, '..')
const indexPage = join(appDir, 'pages/index.js')
const indexPageBak = `${indexPage}.bak`

describe('Mixed getStaticProps and getServerSideProps error', () => {
  it('should error when exporting both getStaticProps and getServerSideProps', async () => {
    const { stderr } = await nextBuild(appDir, [], { stderr: true })
    expect(stderr).toContain(SERVER_PROPS_SSG_CONFLICT)
  })

  it('should error when exporting both getStaticPaths and getServerSideProps', async () => {
    await fs.move(indexPage, indexPageBak)
    await fs.writeFile(
      indexPage,
      `
      export const getStaticPaths = async () => {
        return {
          props: { world: 'world' }, fallback: true
        }
      }

      export const getServerSideProps = async () => {
        return {
          props: { world: 'world' }
        }
      }

      export default ({ world }) => <p>Hello {world}</p>
    `
    )
    const { stderr, code } = await nextBuild(appDir, [], { stderr: true })

    await fs.remove(indexPage)
    await fs.move(indexPageBak, indexPage)
    expect(code).toBe(1)
    expect(stderr).toContain(SERVER_PROPS_SSG_CONFLICT)
  })

  it('should error when exporting getStaticPaths on a non-dynamic page', async () => {
    await fs.move(indexPage, indexPageBak)
    await fs.writeFile(
      indexPage,
      `
      export const getStaticPaths = async () => {
        return {
          props: { world: 'world' }, fallback: true
        }
      }

      export default ({ world }) => <p>Hello {world}</p>
    `
    )
    const { stderr, code } = await nextBuild(appDir, [], { stderr: true })

    await fs.remove(indexPage)
    await fs.move(indexPageBak, indexPage)
    expect(code).toBe(1)
    expect(stderr).toContain(
      "getStaticPaths is only allowed for dynamic SSG pages and was found on '/'."
    )
  })
})
