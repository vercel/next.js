/* eslint-env jest */
import { recursiveRead } from 'next/dist/lib/recursive-readdir'
import { join } from 'path'

const resolveDataDir = join(__dirname, '..', 'isolated', '_resolvedata')
const dirWithPages = join(resolveDataDir, 'server', 'static', 'development')

describe('recursiveReaddir', () => {
  it('should work', async () => {
    const result = await recursiveRead(dirWithPages, /\.js/)
    const pages = ['pages/_error.js', 'pages/index.js', 'pages/non-existent-child.js', 'pages/world.js']
    expect(result.filter((item) => !pages.includes(item)).length).toBe(0)
  })
})
