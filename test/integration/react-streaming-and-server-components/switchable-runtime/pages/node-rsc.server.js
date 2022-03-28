import Runtime from '../utils/runtime'
import Time from '../utils/time'

export default function Page() {
  return (
    <div>
      This is a static RSC page.
      <br />
      <Runtime />
      <br />
      <Time />
    </div>
  )
}

export const config = {
  runtime: 'nodejs',
}
