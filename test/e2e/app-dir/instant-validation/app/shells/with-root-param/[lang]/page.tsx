import { cacheLife } from 'next/cache'
import { DebugLinks } from '../../../shared'

export default async function Page() {
  'use cache'
  cacheLife('minutes')
  return (
    <main>
      <h2>App Shells with root params</h2>
      <ul>
        <li>
          <DebugLinks href="/shells/with-root-param/en/valid-unguarded-root-param" />
        </li>
        <li>
          <DebugLinks href="/shells/with-root-param/en/valid-unguarded-root-param-via-params" />
        </li>
      </ul>
    </main>
  )
}
