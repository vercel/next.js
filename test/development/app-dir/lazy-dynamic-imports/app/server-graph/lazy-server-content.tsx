import { hiddenAction } from './actions'
import { HiddenClient } from './hidden-client'

export function LazyServerContent() {
  return (
    <>
      <p id="server-graph-marker">server-graph-marker</p>
      <HiddenClient action={hiddenAction} />
    </>
  )
}
