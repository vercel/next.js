import * as clientMod from './client'
import { ClientModExportC } from './client'

export default function Page() {
  const A = clientMod.ClientModExportA
  const B = clientMod.ClientModExportB
  const C = clientMod.ClientModExportC

  return (
    <div>
      <p id="a">
        <A />
      </p>
      <p id="b">
        <B />
      </p>
      <p id="c">
        <C />
      </p>
      <p id="named-c">
        <ClientModExportC />
      </p>
    </div>
  )
}
