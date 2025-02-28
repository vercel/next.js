import type { AppDirModules } from '../../build/webpack/loaders/next-app-loader'
import { DEFAULT_SEGMENT_KEY } from '../../shared/lib/segment'

/**
 * LoaderTree is generated in next-app-loader.
 */
export type LoaderTree = [
  segment: string,
  parallelRoutes: { [parallelRouterKey: string]: LoaderTree },
  modules: AppDirModules,
]

export async function getLayoutOrPageModule(loaderTree: LoaderTree) {
  const { layout, page, defaultPage } = loaderTree[2]
  const isLayout = typeof layout !== 'undefined'
  const isPage = typeof page !== 'undefined'
  const isDefaultPage =
    typeof defaultPage !== 'undefined' && loaderTree[0] === DEFAULT_SEGMENT_KEY

  let mod = undefined
  let modType: 'layout' | 'page' | undefined = undefined
  let filePath = undefined

  if (isLayout) {
    mod = await layout[0]()
    modType = 'layout'
    filePath = layout[1]
  } else if (isPage) {
    mod = await page[0]()
    modType = 'page'
    filePath = page[1]
  } else if (isDefaultPage) {
    mod = await defaultPage[0]()
    modType = 'page'
    filePath = defaultPage[1]
  }

  return { mod, modType, filePath }
}

export async function getComponentTypeModule(
  loaderTree: LoaderTree,
  moduleType: 'layout' | 'not-found' | 'forbidden' | 'unauthorized'
) {
  const { [moduleType]: module } = loaderTree[2]
  if (typeof module !== 'undefined') {
    return await module[0]()
  }
  return undefined
}
