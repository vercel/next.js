import { unstable_after as after } from 'next/server'
import { cliLog } from '../../utils/log'

export const dynamic = 'force-static'

export default function Index() {
  after(async () => {
    cliLog({ source: '[page] /invalid-in-dynamic-force-static' })
  })
  return <div>Page with after()</div>
}
