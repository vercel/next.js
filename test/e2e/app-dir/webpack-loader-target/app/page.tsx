import ClientTarget from './client.target-test'
import serverTarget from './server.target-test'

export default function Page() {
  return (
    <main>
      <p id="server-target">{JSON.stringify(serverTarget)}</p>
      <ClientTarget />
    </main>
  )
}
