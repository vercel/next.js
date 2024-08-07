import fs from 'fs'
import path from 'path'
import { promisify } from 'util'
import globOriginal from 'next/dist/compiled/glob'
import { getNextPublicEnvironmentVariables } from '../webpack/plugins/define-env-plugin'
import { Sema } from 'next/dist/compiled/async-sema'

const glob = promisify(globOriginal)

export async function inlineStaticEnv({ distDir }: { distDir: string }) {
  const staticEnv = getNextPublicEnvironmentVariables()

  const serverDir = path.join(distDir, 'server')
  const serverChunks = await glob('**/*.js', {
    cwd: serverDir,
  })
  const clientDir = path.join(distDir, 'static')
  const clientChunks = await glob('**/*.js', {
    cwd: clientDir,
  })

  const inlineSema = new Sema(8)

  for (const [parentDir, files] of [
    [serverDir, serverChunks],
    [clientDir, clientChunks],
  ] as const) {
    await Promise.all(
      files.map(async (file) => {
        await inlineSema.acquire()
        const filepath = path.join(parentDir, file)
        const content = await fs.promises.readFile(filepath, 'utf8')

        await fs.promises.writeFile(
          filepath,
          content.replace(/[\w]{1,}\.env\.NEXT_PUBLIC_[\w]{1,}/g, (match) => {
            let normalizedMatch = `process.env.${match.split('.').pop()}`

            if (staticEnv[normalizedMatch]) {
              return JSON.stringify(staticEnv[normalizedMatch])
            }
            return match
          })
        )
        inlineSema.release()
      })
    )
  }
}
