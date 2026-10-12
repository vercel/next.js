import { state, State } from '../../../lib/state'
export const revalidate = 3600
export function generateStaticParams() {
  return []
}
export default async function Page({ params }) {
  return <State value={state('app-catchall', await params)} />
}
