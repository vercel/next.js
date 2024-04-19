import * as clientMod from './client'
import { ClientModExportC } from './client'

const map = {
  ...clientMod,
}

export default function Page() {
  const list = ['ClientModExportA', 'ClientModExportB', 'ClientModExportC']

  const A = map[list[0]]
  const B = map[list[1]]
  const C = map[list[2]]

  return (
    <div>
      <p>
        <A />
      </p>
      <p>
        <B />
      </p>
      <p>
        <C />
      </p>
      <p>
        <ClientModExportC />
      </p>
    </div>
  )
}
