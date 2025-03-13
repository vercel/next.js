import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { promisify } from 'util'
import globOriginal from 'next/dist/compiled/glob'
import { Sema } from 'next/dist/compiled/async-sema'
import type { NextConfigComplete } from '../server/config-shared'
import { getNextConfigEnv, getStaticEnv } from './static-env'

const glob = promisify(globOriginal)

export async function inlineStaticEnv({
  distDir,
  config,
}: {
  distDir: string
  config: NextConfigComplete
}) {
  const nextConfigEnv = getNextConfigEnv(config)
  const staticEnv = getStaticEnv(config)

  const serverDir = path.join(distDir, 'server')
  const serverChunks = await glob('**/*.{js,json,js.map}', {
    cwd: serverDir,
  })
  const clientDir = path.join(distDir, 'static')
  const clientChunks = await glob('**/*.{js,json,js.map}', {
    cwd: clientDir,
  })
  const manifestChunks = await glob('*.{js,json,js.map}', {
    cwd: distDir,
  })

  const inlineSema = new Sema(8)
  const nextConfigEnvKeys = Object.keys(nextConfigEnv).map((item) =>
    item.split('process.env.').pop()
  )

  const builtRegEx = new RegExp(
    `[\\w]{1,}(\\.env)?\\.(?:NEXT_PUBLIC_[\\w]{1,}${nextConfigEnvKeys.length ? '|' + nextConfigEnvKeys.join('|') : ''})`,
    'g'
  )
  const changedClientFiles: Array<{ file: string; content: string }> = []
  const filesToCheck = new Set<string>(
    manifestChunks.map((f) => path.join(distDir, f))
  )

  for (const [parentDir, files] of [
    [serverDir, serverChunks],
    [clientDir, clientChunks],
  ] as const) {
    await Promise.all(
      files.map(async (file) => {
        await inlineSema.acquire()
        const filepath = path.join(parentDir, file)
        const content = await fs.promises.readFile(filepath, 'utf8')
        const newContent = content.replace(builtRegEx, (match) => {
          let normalizedMatch = `process.env.${match.split('.').pop()}`

          if (staticEnv[normalizedMatch]) {
            return JSON.stringify(staticEnv[normalizedMatch])
          }
          return match
        })

        await fs.promises.writeFile(filepath, newContent)

        if (content !== newContent && parentDir === clientDir) {
          changedClientFiles.push({ file, content: newContent })
        }
        filesToCheck.add(filepath)
        inlineSema.release()
      })
    )
  }
  const hashChanges: Array<{
    originalHash: string
    newHash: string
  }> = []

  // hashes need updating for any changed client files
  for (const { file, content } of changedClientFiles) {
    // hash is 16 chars currently for all client chunks
    const originalHash = file.match(/([a-z0-9]{16})\./)?.[1] || ''

    if (!originalHash) {
      throw new Error(
        `Invariant: client chunk changed but failed to detect hash ${file}`
      )
    }
    const newHash = crypto
      .createHash('sha256')
      .update(content)
      .digest('hex')
      .substring(0, 16)

    hashChanges.push({ originalHash, newHash })

    const filepath = path.join(clientDir, file)
    const newFilepath = filepath.replace(originalHash, newHash)

    filesToCheck.delete(filepath)
    filesToCheck.add(newFilepath)

    await fs.promises.rename(filepath, newFilepath)
  }

  // update build-manifest and webpack-runtime with new hashes
  for (let file of filesToCheck) {
    const content = await fs.promises.readFile(file, 'utf-8')
    let newContent = content

    for (const { originalHash, newHash } of hashChanges) {
      newContent = newContent.replaceAll(originalHash, newHash)
    }
    if (content !== newContent) {
      await fs.promises.writeFile(file, newContent)
    }
  }
}
