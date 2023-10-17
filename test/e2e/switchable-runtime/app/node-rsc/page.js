import Runtime from '../../utils/runtime'
import Time from '../../utils/time'

export default function Page() {
  return (
    <div className="node-rsc">
      This is a static RSC page.
      <br />
      <Runtime />
      <br />
      <Time />
    </div>
  )
}

Page.title = 'node-rsc'

export const runtime = 'nodejs'
