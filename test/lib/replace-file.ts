import path from 'path'
import { randomBytes } from 'crypto'
import { linkSync, renameSync, rmSync, writeFileSync } from 'fs'

/**
 * Replace `outputPath` with `content` without modifying the original file in
 * place and without the file ever disappearing.
 *
 * pnpm installs hard links, so writing into an existing file could corrupt its
 * shared store and affect other fixtures. The replacement is written to a new
 * file in `stagingDir` and then renamed over the target. The rename is atomic,
 * so file watchers never see the file as removed and added again (which would
 * trigger extra compilations that race with the update a test is waiting for).
 *
 * `stagingDir` must be on the same filesystem as `outputPath` and should be
 * outside of any watched project directory.
 *
 * With `runWithTempContent`, the original inode is kept as a hard-linked backup
 * and renamed back after the callback (or removed if the file is new).
 */
export async function replaceFile({
  outputPath,
  stagingDir,
  content,
  mode,
  newFile,
  runWithTempContent,
}: {
  outputPath: string
  stagingDir: string
  content: string
  mode: number | undefined
  newFile: boolean
  runWithTempContent?: (context: { newFile: boolean }) => Promise<void>
}): Promise<void> {
  const id = randomBytes(4).toString('hex')
  const stagingPath = path.join(
    stagingDir,
    `.${path.basename(outputPath)}-patch-${id}`
  )
  const backupPath =
    !newFile && runWithTempContent ? `${outputPath}.${id}.bak` : undefined
  let backupCreated = false

  try {
    writeFileSync(stagingPath, content, { flush: true, mode })
    if (backupPath) {
      linkSync(outputPath, backupPath)
      backupCreated = true
    }
    renameSync(stagingPath, outputPath)
    if (runWithTempContent) {
      await runWithTempContent({ newFile })
    }
  } finally {
    rmSync(stagingPath, { force: true })
    if (runWithTempContent) {
      if (backupCreated) {
        renameSync(backupPath!, outputPath)
      } else if (newFile) {
        rmSync(outputPath, { force: true })
      }
    }
  }
}
