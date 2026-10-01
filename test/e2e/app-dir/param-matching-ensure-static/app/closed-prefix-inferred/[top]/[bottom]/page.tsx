export { default } from '../../../param-page'
export const unstable_ensureStatic = 'navigation'
export const unstable_paramMatching = { top: 'not-found' }

export function generateStaticParams() {
  return [{ top: 't1', bottom: 'b1' }]
}
