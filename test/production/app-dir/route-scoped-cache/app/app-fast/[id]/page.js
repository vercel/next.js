import { state, State } from '../../../lib/state'
export const revalidate = 1

export function generateStaticParams() {
  return ['known', 'seed-cold', 'seed-warm'].map((id) => ({ id }))
}
export default async function Page({ params }) {
  return <State value={state('app-fast', await params)} />
}
