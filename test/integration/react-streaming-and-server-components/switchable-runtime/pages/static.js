import getRuntime from '../utils/runtime'
import getTime from '../utils/time'

export default function Page() {
  return (
    <div>
      This is a static page.
      <br />
      {'Runtime: ' + getRuntime()}
      <br />
      {'Time: ' + getTime()}
    </div>
  )
}
