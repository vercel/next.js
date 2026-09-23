export const experimental_paramMatching = {
  top: 'blocking',
  bottom: 'dynamic',
} as const

export function generateStaticParams() {
  return [{ top: 't1' }]
}

export { CatalogPage as default } from '../../../../catalog-page'
