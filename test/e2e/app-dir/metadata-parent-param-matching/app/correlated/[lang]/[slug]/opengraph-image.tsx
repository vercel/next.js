export { Image as default } from '../../../image'

export const unstable_paramMatching = {
  lang: 'not-found',
  slug: 'not-found',
} as const

export function generateStaticParams() {
  return [
    { lang: 'en', slug: 'first' },
    { lang: 'ja', slug: 'second' },
  ]
}

export function generateImageMetadata({
  params,
}: {
  params: { lang: string; slug: string }
}) {
  return params.slug === 'first' ? [] : [{ id: 'current' }]
}
