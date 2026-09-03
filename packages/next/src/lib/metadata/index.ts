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

export { createMetadataComponentsImpl as createMetadataComponents }
