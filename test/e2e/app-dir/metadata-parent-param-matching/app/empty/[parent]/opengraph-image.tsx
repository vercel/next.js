export { Image as default } from '../../image'

export const unstable_paramMatching = { parent: 'not-found' } as const

export function generateStaticParams() {
  return [{ parent: 'empty' }]
}

export function generateImageMetadata({
  params,
}: {
  params: { parent: string }
}) {
  return params.parent === 'empty' ? [] : [{ id: 'outside' }]
}
