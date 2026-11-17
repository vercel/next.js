export { default } from '../../items/[slug]/page'

export const unstable_paramMatching = { slug: 'blocking' }

export function generateStaticParams() {
  return [{ slug: 'required' }]
}
