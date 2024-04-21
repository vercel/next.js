import * as clientMod from './client-module'
import { ClientModExportC } from './client-module'
import * as clientMod2 from './client-module2'

const mod1Map = {
  ...clientMod,
}

const mod2Map = {
  ...clientMod2,
}

const A = mod1Map.ClientModExportA
const B = mod1Map.ClientModExportB
const C = mod1Map.ClientModExportC
const A2 = mod2Map.ClientMod2ExportA
const B2 = mod2Map.ClientMod2ExportB

export default function Page() {
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
      <p id="a2">
        <A2 />
      </p>
      <p id="b2">
        <B2 />
      </p>
    </div>
  )
}
