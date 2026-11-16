import type { Params } from '../../../../server/request/params'
import { isPlainObject } from '../../../../shared/lib/is-plain-object'

type MetadataEntry = { id: string | number }

export type MetadataRouteStaticParams = {
  parentParams: Params[]
  routeParams: Params[]
}

type MetadataRouteExports = {
  generateStaticParams?: (options: {
    params: Params
  }) => Params[] | Promise<Params[]>
  generateImageMetadata?: (options: {
    params: Params
  }) => MetadataEntry[] | Promise<MetadataEntry[]>
  generateSitemaps?: () => MetadataEntry[] | Promise<MetadataEntry[]>
}

export async function generateMetadataRouteStaticParams(
  userland: MetadataRouteExports,
  params: Params,
  kind: 'image' | 'sitemap'
): Promise<MetadataRouteStaticParams> {
  const parentParams =
    userland.generateStaticParams !== undefined
      ? await userland.generateStaticParams({ params })
      : [params]

  if (!Array.isArray(parentParams)) {
    throw new Error(
      'generateStaticParams in a metadata route must return an array of parameter objects. See more info here: https://nextjs.org/docs/messages/generate-static-params'
    )
  }

  if (parentParams.length === 0) {
    return { parentParams: [], routeParams: [] }
  }

  // Validate the original entries before merging them into plain objects.
  for (const [index, parent] of parentParams.entries()) {
    if (!isPlainObject(parent)) {
      throw new Error(
        `generateStaticParams in a metadata route returned an invalid value at index ${index}. Expected a plain parameter object. See more info here: https://nextjs.org/docs/messages/generate-static-params`
      )
    }
  }

  // Sitemap IDs do not receive parent params. Generate them once and reuse
  // the same list for every parent, as the runtime sitemap handler does.
  const sitemaps =
    kind === 'sitemap' ? await userland.generateSitemaps!() : null
  // A parent remains allowed even when its metadata generator has no IDs.
  // Only complete tuples belong in the list of routes to prerender.
  const resolvedParentParams = parentParams.map((parent) => ({
    ...params,
    ...parent,
  }))
  const routeParams: Params[] = []
  for (const resolvedParams of resolvedParentParams) {
    const metadata =
      kind === 'sitemap'
        ? sitemaps!
        : await userland.generateImageMetadata!({ params: resolvedParams })

    for (const item of metadata) {
      if (item?.id == null) {
        const generator =
          kind === 'image' ? 'generateImageMetadata' : 'generateSitemaps'
        throw new Error(
          `id property is required for every item returned from ${generator}`
        )
      }
      routeParams.push({
        ...resolvedParams,
        __metadata_id__:
          item.id.toString() + (kind === 'sitemap' ? '.xml' : ''),
      })
    }
  }
  return { parentParams: resolvedParentParams, routeParams }
}
