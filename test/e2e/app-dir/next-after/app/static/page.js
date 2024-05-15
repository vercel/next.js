import { unstable_after as after } from 'next/server'
import { persistentLog } from '../../utils/log'

// (patched in tests)
// export const dynamic = 'REPLACE_ME'

export default function Index() {
  after(async () => {
    persistentLog({ source: '[page] /static' })
  })
  return <div>Page with after()</div>
}
