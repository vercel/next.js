/* eslint-env jest */

import fs from 'fs-extra'
import { join } from 'path'
import { nextBuild } from 'next-test-utils'

jest.setTimeout(1000 * 60 * 1)

const appDir = join(__dirname, '../')
const statsPath = join(appDir, '.next/next-stats.json')

describe('Build Stats', () => {
  it('outputs next-stats.json when enabled', async () => {
    await nextBuild(appDir)
    expect(await fs.pathExists(statsPath)).toBe(true)

    const statsString = await fs.readFile(statsPath, 'utf8')
    const statsData = JSON.parse(statsString)

    expect(statsData.version).toBe(0)
    expect(typeof statsData.stats).toBe('object')
  })
})
