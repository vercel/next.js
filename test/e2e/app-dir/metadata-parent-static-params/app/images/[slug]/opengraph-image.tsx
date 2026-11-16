export { Image as default } from '../../image'

export function generateStaticParams() {
  return [{ slug: 'alpha' }, { slug: 'beta' }]
}

export function generateImageMetadata({
  params,
}: {
  params: { slug: string }
}) {
  if (typeof params.slug !== 'string') {
    throw new Error('generateImageMetadata requires the generated parent slug')
  }
  const ids =
    params.slug === 'alpha'
      ? ['alpha-small', 'alpha-large']
      : params.slug === 'beta'
        ? ['beta-wide']
        : [`${params.slug}-runtime`]
  return ids.map((id) => ({
    id,
    size: { width: 64, height: 64 },
    contentType: 'image/png',
  }))
}
