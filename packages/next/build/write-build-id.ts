import fs from 'fs'
import { promisify } from 'util'
import { join } from 'path'
import { BUILD_ID_FILE } from '../next-server/lib/constants'

const writeFile = promisify(fs.writeFile)

export async function writeBuildId(
  distDir: string,
  buildId: string
): Promise<void> {
  const buildIdPath = join(distDir, BUILD_ID_FILE)
  await writeFile(buildIdPath, buildId, 'utf8')
}
