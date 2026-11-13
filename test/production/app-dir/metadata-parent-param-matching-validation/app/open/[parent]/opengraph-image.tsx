import { imageMetadata } from '../../metadata'
export { Image as default } from '../../image'

export function generateStaticParams() {
  return [{ parent: 'empty' }, { parent: 'with-image' }]
}

export function generateImageMetadata({
  params,
}: {
  params: { parent: string }
}) {
  return imageMetadata(params.parent)
}
