export { default } from '../../param-page'
export const ensureStatic = 'prefetch'
export const unstable_paramMatching = { top: 'fallback' }

export function generateStaticParams() {
  return [{ top: 't1' }]
}
