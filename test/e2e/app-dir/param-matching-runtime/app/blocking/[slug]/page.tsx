export const experimental_paramMatching = { slug: 'blocking' } as const

export function generateStaticParams() {
  return [{ slug: 'seed' }]
}

export { PolicyPage as default } from '../../policy-page'
