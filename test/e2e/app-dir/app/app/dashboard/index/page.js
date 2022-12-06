import { LazyClientComponent } from './dynamic-imports/react-lazy-client'
import { NextDynamicServerComponent } from './dynamic-imports/dynamic-server'
import { NextDynamicClientComponent } from './dynamic-imports/dynamic-client'
import { NextDynamicServerImportClientComponent } from './dynamic-imports/dynamic-server-import-client'

export default function DashboardIndexPage() {
  return (
    <>
      <p>hello from app/dashboard/index</p>
      <NextDynamicServerComponent />
      <NextDynamicClientComponent />
      <LazyClientComponent />
      <NextDynamicServerImportClientComponent />
    </>
  )
}
