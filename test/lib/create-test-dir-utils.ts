import os from 'os'
import path from 'path'
import fs from 'fs-extra'
import { randomBytes } from 'crypto'
import { FileRef } from 'e2e-utils'

type Files = FileRef | { [filename: string]: string | FileRef }

export type FilterFn =
  | ((src: string, dest: string, content?: string) => Promise<boolean>)
  | ((src: string, dest: string, content?: string) => boolean)

export async function writeInitialFiles(
  files: Files,
  testDir: string,
  filter?: FilterFn
) {
  if (files instanceof FileRef) {
    // if a FileRef is passed directly to `files` we copy the
    // entire folder to the test directory
    const stats = await fs.stat(files.fsPath)

    if (!stats.isDirectory()) {
      throw new Error(
        `FileRef passed to "files" in "createNext" is not a directory ${files.fsPath}`
      )
    }
    await fs.copy(files.fsPath, testDir, { filter })
  } else {
    for (const filename of Object.keys(files)) {
      const item = files[filename]
      const outputFilename = path.join(testDir, filename)

      if (
        !filter ||
        (await filter(
          filename,
          outputFilename,
          typeof item === 'string' ? item : undefined
        ))
      ) {
        if (typeof item === 'string') {
          await fs.ensureDir(path.dirname(outputFilename))
          await fs.writeFile(outputFilename, item)
        } else {
          await fs.copy(item.fsPath, outputFilename, { filter })
        }
      }
    }
  }
}

export async function initTemporalDirs(dirSuffix = '') {
  const tmpDir = await fs.realpath(process.env.NEXT_TEST_DIR || os.tmpdir())
  const origRepoDir = path.join(__dirname, '../../')
  const installDir = path.join(
    tmpDir,
    `next-install-${randomBytes(32).toString('hex')}${dirSuffix}`
  )
  const tmpRepoDir = path.join(
    tmpDir,
    `next-repo-${randomBytes(32).toString('hex')}${dirSuffix}`
  )

  // ensure swc binary is present in the native folder if
  // not already built
  for (const folder of await fs.readdir(
    path.join(origRepoDir, 'node_modules/@next')
  )) {
    if (folder.startsWith('swc-')) {
      const swcPkgPath = path.join(origRepoDir, 'node_modules/@next', folder)
      const outputPath = path.join(origRepoDir, 'packages/next-swc/native')
      await fs.copy(swcPkgPath, outputPath, {
        filter: (item) => {
          return (
            item === swcPkgPath ||
            (item.endsWith('.node') &&
              !fs.pathExistsSync(path.join(outputPath, path.basename(item))))
          )
        },
      })
    }
  }

  for (const item of ['package.json', 'packages']) {
    await fs.copy(path.join(origRepoDir, item), path.join(tmpRepoDir, item), {
      filter: (item) => {
        return (
          !item.includes('node_modules') &&
          !item.includes('.DS_Store') &&
          // Exclude Rust compilation files
          !/next[\\/]build[\\/]swc[\\/]target/.test(item) &&
          !/next-swc[\\/]target/.test(item)
        )
      },
    })
  }

  return { installDir, tmpRepoDir }
}
