import { createElement } from 'react'
import { NotFoundMetadata } from '../../client/components/http-access-fallback/metadata-boundary'

type CreateMetadataComponents =
  typeof import('./metadata').createMetadataComponents

let createMetadataComponentsImpl: CreateMetadataComponents
if (process.env.__NEXT_PARALLEL_ROUTE_METADATA) {
  createMetadataComponentsImpl = (
    require('./metadata-parallel') as typeof import('./metadata-parallel')
  ).createMetadataComponents
} else {
  createMetadataComponentsImpl = (
    require('./metadata') as typeof import('./metadata')
  ).createMetadataComponents
}

export const createMetadataComponents: CreateMetadataComponents = (options) => {
  const components = createMetadataComponentsImpl(options)
  if (options.errorType) return components

  // Cache both heads together. Rendering notFound() can select different
  // metadata without replacing the normal head in the router's cache.
  const fallback = createMetadataComponentsImpl({
    ...options,
    errorType: 'not-found',
  })

  return {
    MetadataOutlet: components.MetadataOutlet,
    Metadata() {
      return createElement(NotFoundMetadata, {
        children: createElement(components.Metadata),
        fallback: createElement(fallback.Metadata),
      })
    },
    Viewport() {
      return createElement(NotFoundMetadata, {
        children: createElement(components.Viewport),
        fallback: createElement(fallback.Viewport),
      })
    },
  }
}
