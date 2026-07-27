import { ClientComponent } from './client-component'

export default function Page() {
  return (
    <div>
      slot catchall <ClientComponent />
    </div>
  )
}
