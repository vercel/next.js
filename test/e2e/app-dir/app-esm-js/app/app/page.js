import { useHooks } from './hooks'
import { useHooks as useHooks2 } from './hooks-ext'
import { Components } from './components'
import { Components as Components2 } from './components-ext'
import cache from 'next/cache'
import cacheExt from 'next/cache.js'
import server from 'next/server'
import serverExt from 'next/server.js'

export default function Page() {
  const hooks = useHooks()
  const hooks2 = useHooks2()

  return (
    <>
      <div id="without-ext">
        <Components />
      </div>
      <div id="with-ext">
        <Components2 />
      </div>
      {hooks}
      {hooks2}
      <div id="namespace-defaults">
        {typeof cache.unstable_cache},{typeof cacheExt.unstable_cache},
        {typeof server.NextResponse},{typeof serverExt.NextResponse}
      </div>
    </>
  )
}
