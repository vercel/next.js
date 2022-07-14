import { LazyClientComponent } from './react-lazy.client'
import { NextDynamicClientComponent } from './next-dynamic.client'

export default function DashboardIndexPage() {
  return (
    <>
      <p>hello from app/dashboard/index</p>
      <NextDynamicClientComponent />
      <LazyClientComponent />
    </>
  )
}
