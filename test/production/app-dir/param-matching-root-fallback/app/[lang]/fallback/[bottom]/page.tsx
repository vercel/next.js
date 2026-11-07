export const unstable_paramMatching = {
  bottom: 'fallback',
} as const

export function generateStaticParams() {
  return [{ bottom: 'seed' }]
}

export { default } from '../../../param-page'
