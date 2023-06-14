import type { ComponentsType } from '../../build/webpack/loaders/next-app-loader'

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
    typeof defaultPage !== 'undefined' && loaderTree[0] === '__DEFAULT__'

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
