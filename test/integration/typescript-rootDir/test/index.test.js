/* eslint-env jest */

import path from 'path'
import { nextBuild } from 'next-test-utils'

jest.setTimeout(1000 * 60 * 1)
const appDir = path.join(__dirname, '..')

describe('TypeScript build config', () => {
  it('should respect rootDir in tsconfig', async () => {
    const output = await nextBuild(appDir, undefined, {
      stdout: true,
      stderr: true,
    })

    if (output.code) {
      console.log(output)
    }

    expect(output.code).toBe(0)
  })
})
