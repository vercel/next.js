import fs from 'fs'
import os from 'os'
import path from 'path'
import { getMaybePagePath } from './require'

function makeDistDir(pagesManifest: Record<string, string>, appPathsManifest?: Record<string, string>) {
  const distDir = fs.mkdtempSync(path.join(os.tmpdir(), 'next-require-'))
  fs.mkdirSync(path.join(distDir, 'server'), { recursive: true })
  fs.writeFileSync(
    path.join(distDir, 'server', 'pages-manifest.json'),
    JSON.stringify(pagesManifest)
  )
  if (appPathsManifest) {
    fs.writeFileSync(
      path.join(distDir, 'server', 'app-paths-manifest.json'),
      JSON.stringify(appPathsManifest)
    )
  }
  return distDir
}

describe('getMaybePagePath', () => {
  it('resolves locale-prefixed app paths from the app paths manifest', () => {
    const distDir = makeDistDir(
      {},
      { '/en/blog/page': 'app/blog/page.js' }
    )
    try {
      // The app manifest key is locale-prefixed; '/blog/page' must resolve
      // via the locale-stripped lookup, reading values from the APP manifest
      // (the pages manifest is empty here).
      const result = getMaybePagePath('/blog/page', distDir, ['en', 'fr'], true)
      expect(result).toBe(path.join(distDir, 'server', 'app/blog/page.js'))
    } finally {
      fs.rmSync(distDir, { recursive: true, force: true })
    }
  })

  it('does not clobber a direct pages-manifest hit when locales are configured', () => {
    const distDir = makeDistDir({ '/en/about': 'pages/about.js' })
    try {
      // Direct hit on '/en/about' — the locale fallback must not run and
      // overwrite it with a miss.
      const result = getMaybePagePath('/en/about', distDir, ['en'], false)
      expect(result).toBe(path.join(distDir, 'server', 'pages/about.js'))
    } finally {
      fs.rmSync(distDir, { recursive: true, force: true })
    }
  })

  it('returns null for unknown pages', () => {
    const distDir = makeDistDir({ '/index': 'pages/index.js' })
    try {
      expect(
        getMaybePagePath('/definitely-not-here', distDir, ['en'], false)
      ).toBeNull()
    } finally {
      fs.rmSync(distDir, { recursive: true, force: true })
    }
  })
})
