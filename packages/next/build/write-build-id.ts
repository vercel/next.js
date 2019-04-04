import fs from 'fs'
import {promisify} from 'util'
import {join} from 'path'
import {BUILD_ID_FILE, HEAD_BUILD_ID_FILE} from 'next-server/constants'

const writeFile = promisify(fs.writeFile)

export async function writeBuildId (distDir: string, buildId: string, headBuildId: boolean): Promise<void> {
  const buildIdPath = join(distDir, BUILD_ID_FILE)
  await writeFile(buildIdPath, buildId, 'utf8')

  if (headBuildId) {
    const headBuildIdPath = join(distDir, HEAD_BUILD_ID_FILE)
    await writeFile(headBuildIdPath, buildId, 'utf8')
  }
}
