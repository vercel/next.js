import Client from './client'
import { typedValue } from './value.customts'
import { ordinaryValue } from './ordinary'

export default function Page() {
  return (
    <main>
      <p id="server-custom">{typedValue(2)}</p>
      <p id="server-control">{ordinaryValue(2)}</p>
      <Client />
    </main>
  )
}
