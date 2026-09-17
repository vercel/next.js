export const experimental_paramMatching = {
  bottom: 'not-found',
} as const

export function generateStaticParams() {
  return [{ bottom: 'seed' }]
}

export { default } from '../../../param-page'
