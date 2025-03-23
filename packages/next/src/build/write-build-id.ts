import { promises } from 'fs'
import { join } from 'path'
import { BUILD_ID_FILE, IS_TURBOPACK_BUILD } from '../shared/lib/constants'

export async function writeBuildId(
  distDir: string,
  buildId: string
): Promise<void> {
  const buildIdPath = join(distDir, BUILD_ID_FILE)
  await promises.writeFile(buildIdPath, buildId, 'utf8')
}

export async function writeIsTurbopackBuild(distDir: string): Promise<void> {
  const buildIdPath = join(distDir, IS_TURBOPACK_BUILD)
  await promises.writeFile(buildIdPath, '', 'utf8')
}
