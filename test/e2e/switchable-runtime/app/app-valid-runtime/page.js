import Time from '../../utils/time'
import Runtime from '../../utils/runtime'

export default function Page() {
  return (
    <div>
      This is a SSR RSC page.
      <br />
      <Runtime />
      <br />
      <Time />
    </div>
  )
}

export const foo = 'bar',
  runtime = 'edge'
