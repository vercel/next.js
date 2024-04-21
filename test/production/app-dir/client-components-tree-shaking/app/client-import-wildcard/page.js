import * as clientMod from './client-wildcard'
import { ClientModExportC } from './client-wildcard'

const map = {
  ...clientMod,
}

export default function Page() {
  const A = map.ClientModExportA
  const B = map.ClientModExportB
  const C = map.ClientModExportC

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
