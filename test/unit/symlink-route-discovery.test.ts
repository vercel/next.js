/* eslint-env jest */
import fs from 'fs-extra'
import path from 'path'
import os from 'os'

describe('symlink route discovery filtering', () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'next-symlink-test-'))
  })

  afterEach(async () => {
    if (tmpDir) {
      await fs.remove(tmpDir)
    }
  })

  it('correctly filters out page files reachable through symlinked directories', async () => {
    const appDir = path.join(tmpDir, 'app')
    const linkedDir = path.join(tmpDir, 'linked')
    await fs.ensureDir(appDir)
    await fs.ensureDir(linkedDir)

    const rootPage = path.join(appDir, 'page.js')
    const linkedPageTarget = path.join(linkedDir, 'about.js')
    await fs.writeFile(rootPage, 'root')
    await fs.writeFile(linkedPageTarget, 'linked')

    const symlinkDir = path.join(appDir, 'symlink-folder')
    try {
      await fs.symlink(
        linkedDir,
        symlinkDir,
        process.platform === 'win32' ? 'junction' : 'dir'
      )
    } catch {
      // If OS permissions prohibit symlink creation, skip
      return
    }

    const symlinkedPage = path.join(symlinkDir, 'about.js')
    const files = [rootPage, symlinkedPage]

    const filterFile = async (file: string, dir: string) => {
      try {
        const realFile = await fs.realpath(file)
        const realDir = await fs.realpath(dir)
        const relFromReal = path.relative(realDir, realFile)
        const relFromDir = path.relative(dir, file)
        const isSame =
          process.platform === 'win32'
            ? relFromReal.toLowerCase() === relFromDir.toLowerCase()
            : relFromReal === relFromDir
        return isSame ? file : null
      } catch {
        return null
      }
    }

    const initialPageFiles = (
      await Promise.all(files.map((f) => filterFile(f, tmpDir)))
    ).filter(Boolean)

    expect(initialPageFiles).toEqual([rootPage])
  })
})
