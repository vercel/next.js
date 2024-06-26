import { nextTestSetup } from 'e2e-utils'
import glob from 'glob'
import path from 'path'

describe('Provided page/app paths', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
    dependencies: {
      nanoid: '4.0.1',
    },
    env: {
      NEXT_PROVIDED_PAGE_PATHS: JSON.stringify(['/index.js', '/ssg.js']),
      NEXT_PROVIDED_APP_PATHS: JSON.stringify([
        '/dashboard/page.js',
        '/(newroot)/dashboard/another/page.js',
      ]),
    },
  })

  if (isNextDev) {
    it('should skip dev', () => {})
    return
  }

  it('should only build the provided paths', async () => {
    const appPaths = await glob.sync('**/*.js', {
      cwd: path.join(next.testDir, '.next/server/app'),
    })
    const pagePaths = await glob.sync('**/*.js', {
      cwd: path.join(next.testDir, '.next/server/pages'),
    })

    expect(appPaths).toEqual([
      '_not-found/page_client-reference-manifest.js',
      '_not-found/page.js',
      '(newroot)/dashboard/another/page_client-reference-manifest.js',
      '(newroot)/dashboard/another/page.js',
      'dashboard/page_client-reference-manifest.js',
      'dashboard/page.js',
    ])
    expect(pagePaths).toEqual([
      '_app.js',
      '_document.js',
      '_error.js',
      'ssg.js',
    ])

    for (const pathname of ['/', '/ssg', '/dashboard', '/dashboard/another']) {
      const res = await next.fetch(pathname)
      expect(res.status).toBe(200)
    }
  })
})
