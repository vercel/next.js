import greeting from './greeting'
import ClientComponent from './client-component'

export default function Page() {
  return (
    <div>
      <p id="server">{greeting()}</p>
      <ClientComponent />
    </div>
  )
}
