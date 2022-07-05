import Link from 'next/link'
import { ClientComponent } from './test.client.js'

export default function DashboardIndexPage() {
  return (
    <>
      <p>hello from app/dashboard/index</p>
      <ClientComponent />
      <Link href="/client-nested">
        <a>go to client-nested</a>
      </Link>
    </>
  )
}
