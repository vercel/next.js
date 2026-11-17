export { default } from '../../items/[slug]/page'

export function generateStaticParams() {
  return [{ slug: 'known' }]
}
