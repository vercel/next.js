/* eslint-env jest */

import fsp from 'fs/promises'
import path from 'path'
import { nextBuild } from 'next-test-utils'

const appDir = path.join(__dirname, '..')

describe('Invalid Page automatic static optimization', () => {
  ;(process.env.TURBOPACK ? describe.skip : describe)('production mode', () => {
    it('Fails softly with descriptive error', async () => {
      const { stderr } = await nextBuild(appDir, [], { stderr: true })

      expect(stderr).toMatch(
        /Build optimization failed: found pages without a React Component as default export in/
      )
      expect(stderr).toMatch(/pages\/invalid/)
      expect(stderr).toMatch(/pages\/also-invalid/)
    })

    it('handles non-error correctly', async () => {
      const testPage = path.join(appDir, 'pages/[slug].js')
      await fsp.rename(
        path.join(appDir, 'pages'),
        path.join(appDir, 'pages-bak')
      )

      await fsp.mkdir(path.join(appDir, 'pages', { recursive: true }))
      await fsp.writeFile(
        testPage,
        `
      export default function Page() {
        return <p>hello world</p>
      }
      
      export function getStaticPaths() {
        throw 'invalid API token'
      }
      
      export function getStaticProps() {
        return {
          props: {
            hello: 'world'
          }
        }
      }
    `
      )

      try {
        const { stderr } = await nextBuild(appDir, [], { stderr: true })
        expect(stderr).toMatch(/invalid API token/)
        expect(stderr).not.toMatch(/without a React Component/)
      } finally {
        await fsp.rm(path.join(appDir, 'pages'), {
          recursive: true,
          force: true,
        })
        await fsp.rename(
          path.join(appDir, 'pages-bak'),
          path.join(appDir, 'pages')
        )
      }
    })
  })
})
