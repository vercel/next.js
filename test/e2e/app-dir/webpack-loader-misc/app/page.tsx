import ClientTarget from './client.misc-test'
import { mode, target } from './server.misc-test'

export default function Page() {
  return (
    <main>
      <p id="server-target">{JSON.stringify(target)}</p>
      <p id="mode">{mode}</p>
      <ClientTarget />
    </main>
  )
}
