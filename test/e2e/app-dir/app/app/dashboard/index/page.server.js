import { LazyClientComponent } from './react-lazy.client.js'
import { NextDynamicClientComponent } from './next-dynamic.server.js'

export default function DashboardIndexPage() {
  return (
    <>
      <p>hello from app/dashboard/index</p>
      <NextDynamicClientComponent />
      <LazyClientComponent />
    </>
  )
}
