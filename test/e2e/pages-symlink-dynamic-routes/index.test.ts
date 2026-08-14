import { nextTestSetup } from 'e2e-utils'
import { rm, symlink } from 'fs/promises'
import { join } from 'path'

describe('pages symlink dynamic routes', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
    skipStart: true,
    skipDeployment: true,
  })

  if (skipped) {
    return
  }

  beforeAll(async () => {
    const pagesDir = join(next.testDir, 'pages')
    const linkPath = join(pagesDir, 'symlinktest')
    const targetPath = join(pagesDir, 'nolink')

    await rm(linkPath, { recursive: true, force: true })

    await symlink(
      process.platform === 'win32' ? targetPath : 'nolink',
      linkPath,
      process.platform === 'win32' ? 'junction' : 'dir'
    )

    await next.start()
  })

  it('should render dynamic pages through a symlinked pages directory', async () => {
    async function getResult(pathname: string) {
      const $ = await next.render$(pathname)
      return $('#result').text()
    }

    expect(await getResult('/nolink')).toBe('Works')
    expect(await getResult('/nolink/123')).toBe('Works')
    expect(await getResult('/symlinktest')).toBe('Works')
    expect(await getResult('/symlinktest/123')).toBe('Works')
  })
})
