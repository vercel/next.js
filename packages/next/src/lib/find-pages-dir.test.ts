import fs from 'fs'
import os from 'os'
import path from 'path'
import { findDir, findPagesDir } from './find-pages-dir'

describe('find-pages-dir', () => {
  let root: string

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'next-find-pages-dir-'))
  })

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true })
  })

  it.each(['app', 'pages'] as const)(
    'prefers a root %s directory over src/%s',
    (name) => {
      fs.mkdirSync(path.join(root, name))
      fs.mkdirSync(path.join(root, 'src', name), { recursive: true })

      expect(findDir(root, name)).toBe(path.join(root, name))
    }
  )

  it.each(['app', 'pages'] as const)(
    'ignores a root %s file and finds the src directory',
    (name) => {
      fs.writeFileSync(path.join(root, name), '')
      fs.mkdirSync(path.join(root, 'src', name), { recursive: true })

      expect(findDir(root, name)).toBe(path.join(root, 'src', name))
    }
  )

  it.each(['app', 'pages'] as const)(
    'ignores a src/%s file',
    (name) => {
      fs.mkdirSync(path.join(root, 'src'))
      fs.writeFileSync(path.join(root, 'src', name), '')

      expect(findDir(root, name)).toBeNull()
    }
  )

  it('rejects projects containing only files named app and pages', () => {
    fs.writeFileSync(path.join(root, 'app'), '')
    fs.writeFileSync(path.join(root, 'pages'), '')

    expect(() => findPagesDir(root)).toThrow(
      "Couldn't find any `pages` or `app` directory"
    )
  })

  it('accepts a symlink to a directory', () => {
    const target = path.join(root, 'actual-app')
    fs.mkdirSync(target)
    fs.symlinkSync(target, path.join(root, 'app'), 'dir')

    expect(findDir(root, 'app')).toBe(path.join(root, 'app'))
  })
})
