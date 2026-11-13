import { imageMetadata } from '../../metadata'
export { Image as default } from '../../image'

export const unstable_paramMatching = { parent: 'not-found' } as const

export function generateStaticParams() {
  return [{ parent: 'empty-all' }]
}

export function generateImageMetadata({
  params,
}: {
  params: { parent: string }
}) {
  return imageMetadata(params.parent)
}
