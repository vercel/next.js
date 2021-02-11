/* eslint-env jest */

import { nextBuild } from 'next-test-utils'
import { join } from 'path'

jest.setTimeout(1000 * 20)

describe('TailwindCSS Manager', () => {
  const appDir = join(__dirname, '../')

  it('should request user to install tailwindcss package if it is missing', async () => {
    const { code, stderr } = await nextBuild(appDir, [], { stderr: true })
    expect(code).toBe(1)
    expect(stderr).toContain('Please install tailwindcss')
  })
})
