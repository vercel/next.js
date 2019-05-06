/* eslint-env jest */
import mkdirp from 'next/dist/lib/mkdirp'
import { join } from 'path'
import fs from 'fs-extra'

const dir = join(__dirname, 'mkdirp-test-folder')
const level1 = join(dir, 'level1')
const level2 = join(level1, 'midlevel', 'level2')

describe('mkdirp', () => {
  it('should work', async () => {
    await mkdirp(level2)
    expect(await fs.pathExists(level2)).toBe(true)
    await fs.remove(dir)
  })

  it('should work when a part of the tree already exists', async () => {
    await fs.ensureDir(level1)
    await mkdirp(level2)
    expect(await fs.pathExists(level2)).toBe(true)
    await fs.remove(dir)
  })
})
