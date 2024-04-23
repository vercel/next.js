import { unstable_after as after } from 'next/server'
import { persistentLog } from '../../utils/log'

export const dynamic = 'force-static'

export default function Index() {
  after(async () => {
    persistentLog({ source: '[page] /static' })
  })
  return <div>Page with after()</div>
}
