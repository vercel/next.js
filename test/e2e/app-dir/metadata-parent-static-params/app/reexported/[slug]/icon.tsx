export { Image as default } from '../../image'
export { generateStaticParams } from '../params'

export function generateImageMetadata() {
  return [
    { id: 'square', size: { width: 64, height: 64 }, contentType: 'image/png' },
  ]
}
