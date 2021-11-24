/* eslint-env jest */

import path from 'path'
import fs from 'fs-extra'
import { join } from 'path'
import { nextBuild, nextExport } from 'next-test-utils'

jest.setTimeout(1000 * 60 * 2)

const appDir = join(__dirname, '../')
const nextConfig = join(appDir, 'next.config.js')

const addPage = async (page, content) => {
  const pagePath = join(appDir, 'pages', page)
  await fs.ensureDir(path.dirname(pagePath))
  await fs.writeFile(pagePath, content)
}

describe('no-op export', () => {
  afterEach(async () => {
    await Promise.all(
      ['.next', 'pages', 'next.config.js', 'out'].map((file) =>
        fs.remove(join(appDir, file))
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
    await fs.writeFile(
      nextConfig,
      `
      module.exports = {
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

    const exportResult = await nextExport(appDir, {
      outdir: join(appDir, 'out'),
    })
    expect(exportResult.code).toBe(0)
  })
})
