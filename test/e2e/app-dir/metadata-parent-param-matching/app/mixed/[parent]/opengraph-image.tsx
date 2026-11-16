export { Image as default } from '../../image'

export const unstable_paramMatching = { parent: 'not-found' } as const

export function generateStaticParams() {
  console.log('metadata-parent-param-matching: mixed parents')
  return [{ parent: 'empty' }, { parent: 'with-image' }]
}

export function generateImageMetadata({
  params,
}: {
  params: { parent: string }
}) {
  return params.parent === 'empty' ? [] : [{ id: 'current' }]
}
