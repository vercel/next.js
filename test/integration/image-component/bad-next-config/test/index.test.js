/* eslint-env jest */

import { join } from 'path'
import { nextBuild } from 'next-test-utils'
import fs from 'fs-extra'

jest.setTimeout(1000 * 30)

const appDir = join(__dirname, '../')
const nextConfig = join(appDir, 'next.config.js')

describe('Next.config.js images prop without default host', () => {
  let build
  beforeAll(async () => {
    await fs.writeFile(
      nextConfig,
      `module.exports = {
        images: {
          hosts: {
            secondary: {
              path: 'https://examplesecondary.com/images/',
              loader: 'cloudinary',
            },
          },
          breakpoints: [480, 1024, 1600],
        },
      }`,
      'utf8'
    )
    build = await nextBuild(appDir, [], {
      stdout: true,
      stderr: true,
    })
  })
  it('Should error during build if images prop in next.config is malformed', () => {
    expect(build.stderr).toContain(
      'If the image configuration property is present in next.config.js, it must have a host named "default"'
    )
  })
})

describe('Next.config.js images prop without path', () => {
  let build
  beforeAll(async () => {
    await fs.writeFile(
      nextConfig,
      `module.exports = {
        images: {
          hosts: {
            default: {
              path: 'https://examplesecondary.com/images/',
              loader: 'cloudinary',
            },
            secondary: {
              loader: 'cloudinary',
            },
          },
          breakpoints: [480, 1024, 1600],
        },
      }`,
      'utf8'
    )
    build = await nextBuild(appDir, [], {
      stdout: true,
      stderr: true,
    })
  })
  afterAll(async () => {
    await fs.remove(nextConfig)
  })
  it('Should error during build if images prop in next.config is malformed', () => {
    expect(build.stderr).toContain(
      'All hosts defined in the image configuration property of next.config.js must define a path'
    )
  })
})
