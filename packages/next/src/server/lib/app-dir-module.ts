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
  return isLayout ? await layout[0]() : isPage ? await page[0]() : undefined
}
