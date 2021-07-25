/* eslint-env jest */

import fs from 'fs-extra'
import { join } from 'path'
import { nextBuild } from 'next-test-utils'

jest.setTimeout(1000 * 60 * 1)

const appDir = join(__dirname, '../')
const pagesDir = join(appDir, 'pages')

describe('Conflicting SSG paths', () => {
  afterEach(() => fs.remove(pagesDir))

  it('should show proper error when two dynamic SSG routes have conflicting paths', async () => {
    await fs.ensureDir(join(pagesDir, 'blog'))
    await fs.writeFile(
      join(pagesDir, 'blog/[slug].js'),
      `
      export const getStaticProps = () => {
        return {
          props: {}
        }
      }

      export const getStaticPaths = () => {
        return {
          paths: [
            '/blog/conflicting',
            '/blog/first'
          ],
          fallback: false
        }
      }

      export default function Page() {
        return '/blog/[slug]'
      }
    `
    )

    await fs.writeFile(
      join(pagesDir, '[...catchAll].js'),
      `
      export const getStaticProps = () => {
        return {
          props: {}
        }
      }

      export const getStaticPaths = () => {
        return {
          paths: [
            '/blog/conflicting',
            '/hello/world'
          ],
          fallback: false
        }
      }

      export default function Page() {
        return '/[catchAll]'
      }
    `
    )

    const result = await nextBuild(appDir, undefined, {
      stdout: true,
      stderr: true,
    })
    const output = result.stdout + result.stderr
    expect(output).toContain(
      'Conflicting paths returned from getStaticPaths, paths must unique per page'
    )
    expect(output).toContain(
      'https://nextjs.org/docs/messages/conflicting-ssg-paths'
    )
    expect(output).toContain(
      `path: "/blog/conflicting" from page: "/[...catchAll]"`
    )
    expect(output).toContain(`conflicts with path: "/blog/conflicting"`)
  })

  it('should show proper error when a dynamic SSG route conflicts with normal route', async () => {
    await fs.ensureDir(join(pagesDir, 'hello'))
    await fs.writeFile(
      join(pagesDir, 'hello/world.js'),
      `
      export default function Page() {
        return '/hello/world'
      }
    `
    )

    await fs.writeFile(
      join(pagesDir, '[...catchAll].js'),
      `
      export const getStaticProps = () => {
        return {
          props: {}
        }
      }

      export const getStaticPaths = () => {
        return {
          paths: [
            '/hello',
            '/hellO/world'
          ],
          fallback: false
        }
      }

      export default function Page() {
        return '/[catchAll]'
      }
    `
    )

    const result = await nextBuild(appDir, undefined, {
      stdout: true,
      stderr: true,
    })
    const output = result.stdout + result.stderr
    expect(output).toContain(
      'Conflicting paths returned from getStaticPaths, paths must unique per page'
    )
    expect(output).toContain(
      'https://nextjs.org/docs/messages/conflicting-ssg-paths'
    )
    expect(output).toContain(
      `path: "/hellO/world" from page: "/[...catchAll]" conflicts with path: "/hello/world"`
    )
  })

  it('should show proper error when a dynamic SSG route conflicts with SSR route', async () => {
    await fs.ensureDir(join(pagesDir, 'hello'))
    await fs.writeFile(
      join(pagesDir, 'hello/world.js'),
      `
      export const getServerSideProps = () => ({ props: {} })

      export default function Page() {
        return '/hello/world'
      }
    `
    )

    await fs.writeFile(
      join(pagesDir, '[...catchAll].js'),
      `
      export const getStaticProps = () => {
        return {
          props: {}
        }
      }

      export const getStaticPaths = () => {
        return {
          paths: [
            '/hello',
            '/hellO/world'
          ],
          fallback: false
        }
      }

      export default function Page() {
        return '/[catchAll]'
      }
    `
    )

    const result = await nextBuild(appDir, undefined, {
      stdout: true,
      stderr: true,
    })
    const output = result.stdout + result.stderr
    expect(output).toContain(
      'Conflicting paths returned from getStaticPaths, paths must unique per page'
    )
    expect(output).toContain(
      'https://nextjs.org/docs/messages/conflicting-ssg-paths'
    )
    expect(output).toContain(
      `path: "/hellO/world" from page: "/[...catchAll]" conflicts with path: "/hello/world"`
    )
  })
})
