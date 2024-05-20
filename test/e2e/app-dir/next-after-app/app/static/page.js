import { unstable_after as after } from 'next/server'
import { cliLog } from '../../utils/log'

// (patched in tests)
// export const dynamic = 'REPLACE_ME'

export default function Index() {
  after(async () => {
    cliLog({ source: '[page] /static' })
  })
  return <div>Page with after()</div>
}
