import type { ComponentsType } from '../../build/webpack/loaders/next-app-loader'
import { DEFAULT_SEGMENT_KEY } from '../../shared/lib/segment'

/**
 * LoaderTree is generated in next-app-loader.
 */
export type LoaderTree = [
  segment: string,
  parallelRoutes: { [parallelRouterKey: string]: LoaderTree },
  components: ComponentsType
]

export async function getLayoutOrPageModule(loaderTree: LoaderTree) {
  const { layout, page, defaultPage } = loaderTree[2]
  const isLayout = typeof layout !== 'undefined'
  const isPage = typeof page !== 'undefined'
  const isDefaultPage =
    typeof defaultPage !== 'undefined' && loaderTree[0] === DEFAULT_SEGMENT_KEY

  let value = undefined
  let modType: 'layout' | 'page' | undefined = undefined

  if (isLayout) {
    value = await layout[0]()
    modType = 'layout'
  } else if (isPage) {
    value = await page[0]()
    modType = 'page'
  } else if (isDefaultPage) {
    value = await defaultPage[0]()
    modType = 'page'
  }

  return [value, modType] as const
}

export async function getComponentTypeModule(
  loaderTree: LoaderTree,
  componentType: 'layout' | 'not-found'
) {
  const { [componentType]: component } = loaderTree[2]
  if (typeof component !== 'undefined') {
    return await component[0]()
  }
  return undefined
}
