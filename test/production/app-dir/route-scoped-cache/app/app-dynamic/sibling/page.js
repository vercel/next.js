import { state, State } from '../../../lib/state'

export const dynamic = 'force-static'

export default function Page() {
  return <State value={state('app-dynamic-sibling')} />
}
