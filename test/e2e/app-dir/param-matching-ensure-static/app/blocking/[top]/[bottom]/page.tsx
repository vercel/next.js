export { default } from '../../../param-page'
export const unstable_ensureStatic = 'navigation'
export const unstable_paramMatching = { top: 'blocking', bottom: 'blocking' }

export function generateStaticParams() {
  return [{ top: 't1', bottom: 'b1' }]
}
