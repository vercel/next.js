import { unstable_after as after } from 'next/server'
import { cliLog } from '../../utils/log'

export const dynamic = 'error'

export default function Index() {
  after(async () => {
    cliLog({ source: '[page] /invalid-in-dynamic-error' })
  })
  return <div>Page with after()</div>
}
