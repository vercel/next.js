import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { promisify } from 'util'
import globOriginal from 'next/dist/compiled/glob'
import {
  getNextConfigEnv,
  getNextPublicEnvironmentVariables,
} from '../build/webpack/plugins/define-env-plugin'
import { Sema } from 'next/dist/compiled/async-sema'
import type { NextConfigComplete } from '../server/config-shared'
import { BUILD_MANIFEST } from '../shared/lib/constants'

const glob = promisify(globOriginal)

const getStaticEnv = (config: NextConfigComplete) => {
  const staticEnv: Record<string, string | undefined> = {
    ...getNextPublicEnvironmentVariables(),
    ...getNextConfigEnv(config),
    'process.env.NEXT_DEPLOYMENT_ID': config.deploymentId || '',
  }
  return staticEnv
}

export function populateStaticEnv(config: NextConfigComplete) {
  // since inlining comes after static generation we need
  // to ensure this value is assigned to process env so it
  // can still be accessed
  const staticEnv = getStaticEnv(config)
  for (const key in staticEnv) {
    const innerKey = key.split('.').pop() || ''
    if (!process.env[innerKey]) {
      process.env[innerKey] = staticEnv[key] || ''
    }
  }
}

export async function inlineStaticEnv({
  distDir,
  config,
  buildId,
}: {
  distDir: string
  buildId: string
  config: NextConfigComplete
}) {
  const nextConfigEnv = getNextConfigEnv(config)
  const staticEnv = getStaticEnv(config)

  const serverDir = path.join(distDir, 'server')
  const serverChunks = await glob('**/*.js', {
    cwd: serverDir,
  })
  const clientDir = path.join(distDir, 'static')
  const clientChunks = await glob('**/*.js', {
    cwd: clientDir,
  })
  const webpackRuntimeFile = clientChunks.find((item) =>
    item.match(/webpack-[a-z0-9]{16}/)
  )

  if (!webpackRuntimeFile) {
    throw new Error(`Invariant failed to find webpack runtime chunk`)
  }

  const inlineSema = new Sema(8)
  const nextConfigEnvKeys = Object.keys(nextConfigEnv).map((item) =>
    item.split('process.env.').pop()
  )

  const builtRegEx = new RegExp(
    `[\\w]{1,}(\\.env)?\\.(?:NEXT_PUBLIC_[\\w]{1,}${nextConfigEnvKeys.length ? '|' + nextConfigEnvKeys.join('|') : ''})`,
    'g'
  )
  const changedClientFiles: Array<{ file: string; content: string }> = []

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
        inlineSema.release()
      })
    )
  }
  const hashChanges: Array<{
    originalHash: string
    newHash: string
    file: string
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

    hashChanges.push({ originalHash, newHash, file })
    const filepath = path.join(clientDir, file)
    await fs.promises.rename(filepath, filepath.replace(originalHash, newHash))
  }

  // update build-manifest and webpack-runtime with new hashes
  for (const file of [
    path.join(distDir, BUILD_MANIFEST),
    path.join(distDir, 'static', webpackRuntimeFile),
    path.join(distDir, 'static', buildId, '_buildManifest.js'),
  ]) {
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
