import { state, State } from '../../../../lib/state'

export const revalidate = 3600
export function generateStaticParams() {
  return [{ id: 'known' }]
}
export default async function Page({ params }) {
  return <State value={state('app-grouped', await params)} />
}
