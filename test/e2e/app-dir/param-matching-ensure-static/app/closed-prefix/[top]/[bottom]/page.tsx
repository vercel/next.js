export { default } from '../../../param-page'
export const ensureStatic = 'navigation'
export const unstable_paramMatching = { top: 'not-found', bottom: 'blocking' }

export function generateStaticParams() {
  return [{ top: 't1', bottom: 'b1' }]
}
