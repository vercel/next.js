/* eslint-env jest */

import { move } from 'fs-extra'
import fsp from 'fs/promises'
import { join } from 'path'
import { nextBuild } from 'next-test-utils'
import { SERVER_PROPS_SSG_CONFLICT } from 'next/dist/lib/constants'

const appDir = join(__dirname, '..')
const indexPage = join(appDir, 'pages/index.js')
const indexPageBak = `${indexPage}.bak`

describe('Mixed getStaticProps and getServerSideProps error', () => {
  ;(process.env.TURBOPACK ? describe.skip : describe)('production mode', () => {
    it('should error with getStaticProps but no default export', async () => {
      // TODO: remove after investigating why dev swc build fails here
      await fsp.writeFile(
        join(appDir, '.babelrc'),
        '{ "presets": ["next/babel"] }'
      )
      await move(indexPage, indexPageBak)
      await fsp.writeFile(
        indexPage,
        `
      export function getStaticProps() {
        return {
          props: {}
        }
      }
    `
      )
      const { stderr } = await nextBuild(appDir, [], { stderr: true })
      await fsp.rm(join(appDir, '.babelrc'), { recursive: true, force: true })
      await fsp.rm(indexPage, { recursive: true, force: true })
      await move(indexPageBak, indexPage)
      expect(stderr).toContain(
        'found page without a React Component as default export in'
      )
    })

    it('should error when exporting both getStaticProps and getServerSideProps', async () => {
      // TODO: remove after investigating why dev swc build fails here
      await fsp.writeFile(
        join(appDir, '.babelrc'),
        '{ "presets": ["next/babel"] }'
      )
      const { stderr } = await nextBuild(appDir, [], { stderr: true })
      await fsp.rm(join(appDir, '.babelrc'), { recursive: true, force: true })
      expect(stderr).toContain(SERVER_PROPS_SSG_CONFLICT)
    })

    it('should error when exporting both getStaticPaths and getServerSideProps', async () => {
      // TODO: remove after investigating why dev swc build fails here
      await fsp.writeFile(
        join(appDir, '.babelrc'),
        '{ "presets": ["next/babel"] }'
      )
      await move(indexPage, indexPageBak)
      await fsp.writeFile(
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
      await fsp.rm(join(appDir, '.babelrc'), { recursive: true, force: true })
      await fsp.rm(indexPage, { recursive: true, force: true })
      await move(indexPageBak, indexPage)
      expect(code).toBe(1)
      expect(stderr).toContain(SERVER_PROPS_SSG_CONFLICT)
    })

    it('should error when exporting getStaticPaths on a non-dynamic page', async () => {
      await move(indexPage, indexPageBak)
      await fsp.writeFile(
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

      await fsp.rm(indexPage, { recursive: true, force: true })
      await move(indexPageBak, indexPage)
      expect(code).toBe(1)
      expect(stderr).toContain(
        "getStaticPaths is only allowed for dynamic SSG pages and was found on '/'."
      )
    })
  })
})
