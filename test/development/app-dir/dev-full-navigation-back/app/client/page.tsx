import { clientValue } from '../client-value'
import { ClientComponent } from './client-component'

export default function Page() {
  return (
    <>
      <p id="server-value">{clientValue}</p>
      <ClientComponent />
      <a id="to-about" href="/about">
        About
      </a>
    </>
  )
}
