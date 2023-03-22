import { ComponentsType } from '../../build/webpack/loaders/next-app-loader'

/**
 * LoaderTree is generated in next-app-loader.
 */
export type LoaderTree = [
  segment: string,
  parallelRoutes: { [parallelRouterKey: string]: LoaderTree },
  components: ComponentsType
]

export async function getLayoutOrPageModule(loaderTree: LoaderTree) {
  const { layout, page } = loaderTree[2]
  const isLayout = typeof layout !== 'undefined'
  const isPage = typeof page !== 'undefined'

  let value = undefined
  let modType: 'layout' | 'page' | undefined = undefined
  if (isLayout) {
    value = await layout[0]()
    modType = 'layout'
  }
  if (isPage) {
    value = await page[0]()
    modType = 'page'
  }

  return [value, modType] as const
}
