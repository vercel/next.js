import { read, set, value } from '../lib/barrel'
import * as state from '../lib/barrel'
import { read as readThroughStar } from '../lib/star'
import * as forwardedState from '../lib/star'

export default function Page() {
  set(42)
  const updated = `${value}:${read()}:${state.value}:${readThroughStar()}:${forwardedState.value}`
  set(0)
  return <p>{updated}</p>
}
