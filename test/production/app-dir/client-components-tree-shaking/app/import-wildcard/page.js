import * as clientMod from './client'

export default function Page() {
  return (
    <div>
      <p>
        <clientMod.ClientModExportA />
      </p>
      <p>
        <clientMod.ClientModExportB />
      </p>
    </div>
  )
}
