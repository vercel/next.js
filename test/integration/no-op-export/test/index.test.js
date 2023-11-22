/* eslint-env jest */

import path from 'path'
import fsp from 'fs/promises'
import { join } from 'path'
import { nextBuild } from 'next-test-utils'

const appDir = join(__dirname, '../')
const nextConfig = join(appDir, 'next.config.js')

const addPage = async (page, content) => {
  const pagePath = join(appDir, 'pages', page)
  await fsp.mkdir(path.dirname(pagePath), { recursive: true })
  await fsp.writeFile(pagePath, content)
}

describe('no-op export', () => {
  ;(process.env.TURBOPACK ? describe.skip : describe)('production mode', () => {
    afterEach(async () => {
      await Promise.all(
        ['.next', 'pages', 'next.config.js', 'out'].map((file) =>
          fsp.rm(join(appDir, file), { recursive: true, force: true })
        )
      )
    })

    it('should not error for all server-side pages build', async () => {
      await addPage(
        '_error.js',
        `
      import React from 'react'
      export default class Error extends React.Component {
        static async getInitialProps() {
          return {
            props: {
              statusCode: 'oops'
            }
          }
        }
        render() {
          return 'error page'
        }
      }
    `
      )
      await addPage(
        '[slug].js',
        `
      export const getStaticProps = () => {
        return {
          props: {}
        }
      }
      export const getStaticPaths = () => {
        return {
          paths: [],
          fallback: false
        }
      }
      export default function Page() {
        return 'page'
      }
    `
      )
      const result = await nextBuild(appDir, undefined, {
        stderr: 'log',
        stdout: 'log',
      })
      expect(result.code).toBe(0)
    })

    it('should not error for empty exportPathMap', async () => {
      await addPage(
        'index.js',
        `
      export default function Index() {
        return 'hello world'
      }
    `
      )
      await fsp.writeFile(
        nextConfig,
        `
      module.exports = {
        output: 'export',
        exportPathMap() {
          return {}
        }
      }
    `
      )
      const buildResult = await nextBuild(appDir, undefined, {
        stderr: 'log',
        stdout: 'log',
      })
      expect(buildResult.code).toBe(0)
    })
  })
})
