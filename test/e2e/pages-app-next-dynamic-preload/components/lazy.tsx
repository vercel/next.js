import { appShared } from './app-shared'
import { lazyOnly } from './lazy-only'
import { pageShared } from './page-shared'

export function Lazy() {
  return (
    <p id="lazy">
      {[appShared('lazy'), pageShared('lazy'), lazyOnly('lazy')].join(',')}
    </p>
  )
}
