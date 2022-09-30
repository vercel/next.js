import { promises } from 'fs'
import { join } from 'path'
import { BUILD_ID_FILE } from '../shared/lib/constants'

export async function writeBuildId(
  distDir: string,
  buildId: string
): Promise<void> {
  const buildIdPath = join(distDir, BUILD_ID_FILE)
  await promises.writeFile(buildIdPath, buildId, 'utf8')
}
