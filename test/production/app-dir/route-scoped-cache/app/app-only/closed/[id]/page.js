import { state, State } from '../../../../lib/state'
export const revalidate = 3600
export const dynamicParams = false
export function generateStaticParams() {
  return ['known', 'seed-cold', 'seed-warm'].map((id) => ({ id }))
}
export default async function Page({ params }) {
  return <State value={state('app-only-closed', await params)} />
}
