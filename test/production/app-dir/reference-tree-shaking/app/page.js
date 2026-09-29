import { Server } from '../library/index.js'
import { UsedDynamic } from '../library/dynamic.js' with { 'turbopack-transition': 'next-dynamic' }
import { UsedServerComponent } from '../library/server-component.js' with { 'turbopack-transition': 'next-server-component' }
import { usedServerUtility } from '../library/server-utility.js' with { 'turbopack-transition': 'next-server-utility' }

export default function page() {
  return (
    <>
      <Server />
      <UsedDynamic />
      <UsedServerComponent />
      {usedServerUtility()}
    </>
  )
}
