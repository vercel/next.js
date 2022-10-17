// shared named exports
import { a, b, c, d, e } from '../../components/shared-exports'
// client default, named exports
import DefaultArrow, {
  Named as ClientNamed,
} from '../../components/client-exports'

import { Cjs as CjsShared } from '../../components/cjs-server'
import { Cjs as CjsClient } from '../../components/cjs-client'

// client exports all
import { One, Two, TwoAliased } from '../../components/export-all'

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
      <div>
        <CjsShared />
      </div>
      <div>
        <CjsClient />
      </div>
      <div>
        Export All: <One />, <Two />, <TwoAliased />
      </div>
    </div>
  )
}
