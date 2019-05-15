/* eslint-env jest */
import { mkdirp, mkdirpSync } from 'next/dist/lib/mkdirp'
import { join } from 'path'
import fs from 'fs-extra'

const dir = join(__dirname, 'mkdirp-test-folder')
const level1 = join(dir, 'level1')
const level2 = join(level1, 'midlevel', 'level2')

describe.each([['mkdirp', mkdirp], ['mkdirpSync', mkdirpSync]])(
  '%s',
  (_, fn) => {
    test('should work', async () => {
      await fn(level2)
      expect(await fs.pathExists(level2)).toBe(true)
      await fs.remove(dir)
    })

    test('should work when a part of the tree already exists', async () => {
      await fs.ensureDir(level1)
      await fn(level2)
      expect(await fs.pathExists(level2)).toBe(true)
      await fs.remove(dir)
    })
  }
)
