export { default } from '../../param-page'
export const unstable_ensureStatic = 'prefetch'
export const unstable_paramMatching = { top: 'fallback' }

export function generateStaticParams() {
  return [{ top: 't1' }]
}
