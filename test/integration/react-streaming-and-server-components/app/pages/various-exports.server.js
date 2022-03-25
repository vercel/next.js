// shared named exports
import { a, b, c, d, e } from '../components/shared-exports'
// client default, named exports
import DefaultArrow, {
  Named as ClientNamed,
} from '../components/client-exports.client'
import { Cjs as CjsShared } from '../components/cjs'
import { Cjs as CjsClient } from '../components/cjs.client'

export default function Page() {
  return (
    <div>
      <div>
        {a}
        {b}
        {c}
        {d}
        {e[0]}
      </div>
      <div>
        <DefaultArrow />
      </div>
      <div>
        <ClientNamed />
      </div>
      <di>
        <CjsShared />
      </di>
      <di>
        <CjsClient />
      </di>
    </div>
  )
}
