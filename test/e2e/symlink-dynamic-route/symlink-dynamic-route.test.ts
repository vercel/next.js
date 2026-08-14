import { nextTestSetup } from 'e2e-utils'
import { join } from 'path'
import { symlink } from 'fs/promises'

describe('symlink-dynamic-route', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  beforeAll(async () => {
    await symlink(
      join(next.testDir, 'pages', 'nolink'),
      join(next.testDir, 'pages', 'symlinktest')
    )
  })

  it('should support dynamic routes through symlinks', async () => {
    const $ = await next.render$('/symlinktest/123')

    expect($('p').text()).toBe('Dynamic page works: 123')
  })

  it('should still support dynamic routes without symlinks', async () => {
    const $ = await next.render$('/nolink/123')

    expect($('p').text()).toBe('Dynamic page works: 123')
  })

  it('should support index routes through symlinks', async () => {
    const $ = await next.render$('/symlinktest')

    expect($('p').text()).toBe('Index page works')
  })
})
