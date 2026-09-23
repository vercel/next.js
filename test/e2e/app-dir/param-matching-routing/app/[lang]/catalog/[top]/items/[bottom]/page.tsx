export const experimental_paramMatching = {
  top: 'blocking',
  bottom: 'fallback',
} as const

export function generateStaticParams() {
  return [{ top: 't1', bottom: 'b1' }]
}

export { CatalogPage as default } from '../../../../../catalog-page'
