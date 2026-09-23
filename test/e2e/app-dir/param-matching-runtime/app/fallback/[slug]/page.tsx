export const experimental_paramMatching = { slug: 'fallback' } as const

export function generateStaticParams() {
  return [{ slug: 'seed' }]
}

export { PolicyPage as default } from '../../policy-page'
