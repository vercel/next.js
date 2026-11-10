import { state, State } from '../../../lib/state'

export const dynamic = 'force-dynamic'

export default async function Page({ params }) {
  return <State value={state('app-dynamic-catchall', await params)} />
}
