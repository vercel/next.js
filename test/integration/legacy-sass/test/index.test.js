/* eslint-env jest */
/* global jasmine */
import { remove } from 'fs-extra'
import { nextBuild } from 'next-test-utils'
import { recursiveReadDir } from 'next/dist/lib/recursive-readdir'
import { join } from 'path'

jasmine.DEFAULT_TIMEOUT_INTERVAL = 1000 * 60 * 1

const appDir = join(__dirname, '../')

describe('Legacy Sass Support Should Disable New CSS', () => {
  beforeAll(async () => {
    await remove(join(appDir, '.next'))
    await nextBuild(appDir)
  })

  it(`should've emitted a single CSS file`, async () => {
    const cssFiles = await recursiveReadDir(
      join(appDir, '.next', 'static'),
      /\.css$/
    )

    expect(cssFiles.length).toBe(1)
  })
})
