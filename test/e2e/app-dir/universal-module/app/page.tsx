import { getValue } from '#universal'
import { sharedGetValue } from './shared'
import { ClientView } from './client-view'

export default async function Page() {
  return (
    <main>
      <section>
        <h2>Server component</h2>
        <p id="server-direct">direct: {await getValue()}</p>
        <p id="server-shared">via shared: {await sharedGetValue()}</p>
      </section>
      <ClientView />
    </main>
  )
}
