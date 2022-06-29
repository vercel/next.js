/* eslint-env jest */

import fs from 'fs-extra'
import { join } from 'path'
import { nextBuild } from 'next-test-utils'

const appDir = join(__dirname, '..')
const pagesDir = join(appDir, 'pages')
const testPage = join(pagesDir, 'test.js')

const writePage = async (content) => {
  await fs.ensureDir(pagesDir)
  await fs.writeFile(testPage, content)
}

describe('GSP build errors', () => {
  afterEach(() => fs.remove(pagesDir))

  it('should fail build from module not found', async () => {
    await writePage(`
      __non_webpack_require__('a-cool-module')
      
      export function getStaticProps() {
        return {
          props: {}
        }  
      }
      
      export default function () {
        return null
      }
    `)
    const { stderr, code } = await nextBuild(appDir, [], { stderr: true })
    expect(code).toBe(1)
    expect(stderr).toContain('a-cool-module')
  })

  it('should fail build from ENOENT in getStaticProps', async () => {
    await writePage(`
      
      export function getStaticProps() {
        require('fs').readFileSync('a-cool-file')
        return {
          props: {}
        }  
      }
      
      export default function () {
        return null
      }
    `)
    const { stderr, code } = await nextBuild(appDir, [], { stderr: true })
    expect(code).toBe(1)
    expect(stderr).toContain('a-cool-file')
  })

  it('should fail build on normal error in getStaticProps', async () => {
    await writePage(`
      export function getStaticProps() {
        throw new Error('a cool error')
        return {
          props: {}
        }  
      }
      
      export default function () {
        return null
      }
    `)
    const { stderr, code } = await nextBuild(appDir, [], { stderr: true })
    expect(code).toBe(1)
    expect(stderr).toContain('a cool error')
  })

  it('should fail build from undefined error in getStaticProps', async () => {
    await writePage(`
      export function getStaticProps() {
        throw undefined
        return {
          props: {}
        }  
      }
      
      export default function () {
        return null
      }
    `)
    const { stderr, code } = await nextBuild(appDir, [], { stderr: true })
    expect(code).toBe(1)
    expect(stderr).toContain('undefined')
  })

  it('should fail build from string error in getStaticProps', async () => {
    await writePage(`
      export function getStaticProps() {
        throw 'a string error'
        return {
          props: {}
        }  
      }
      
      export default function () {
        return null
      }
    `)
    const { stderr, code } = await nextBuild(appDir, [], { stderr: true })
    expect(code).toBe(1)
    expect(stderr).toContain('a string error')
  })
})
