import getRuntime from '../utils/runtime'
import getTime from '../utils/time'

export default function Page() {
  return (
    <div>
      This is a static RSC page.
      <br />
      {'Runtime: ' + getRuntime()}
      <br />
      {'Time: ' + getTime()}
    </div>
  )
}

export const config = {
  runtime: 'nodejs',
}
