export { Image as default } from '../../image'

export const unstable_paramMatching = { parent: 'not-found' } as const

export function generateStaticParams() {
  return [{ parent: 'allowed' }]
}

export function generateImageMetadata() {
  return []
}
