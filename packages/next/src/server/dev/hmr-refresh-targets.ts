import { extname, relative, resolve, sep } from 'path'
import type { HmrRefreshTarget } from '../../shared/lib/app-router-types'
import type { ServerComponentRenderScope } from './hot-reloader-types'

export function getHmrRefreshTargets(
  changedFiles: ReadonlySet<string>,
  appDir: string | undefined,
  pageExtensions: readonly string[]
): ServerComponentRenderScope {
  if (appDir === undefined || changedFiles.size === 0) {
    return { type: 'all' }
  }

  const appDirPath = resolve(appDir)
  const targets = new Set<HmrRefreshTarget>()

  for (const changedFile of changedFiles) {
    const relativePath = relative(appDirPath, resolve(changedFile))
    if (
      relativePath === '' ||
      relativePath === '..' ||
      relativePath.startsWith(`..${sep}`)
    ) {
      return { type: 'all' }
    }

    const extension = extname(relativePath).slice(1)
    if (!pageExtensions.includes(extension)) {
      return { type: 'all' }
    }

    const pathWithoutExtension = relativePath
      .slice(0, -(extension.length + 1))
      .replaceAll(sep, '/')
    const convention = pathWithoutExtension.slice(
      pathWithoutExtension.lastIndexOf('/') + 1
    )
    if (
      convention !== 'page' &&
      convention !== 'layout' &&
      convention !== 'default'
    ) {
      return { type: 'all' }
    }

    targets.add(`/${pathWithoutExtension}`)
  }

  return targets.size === 0
    ? { type: 'all' }
    : { type: 'targets', targets: [...targets] }
}
