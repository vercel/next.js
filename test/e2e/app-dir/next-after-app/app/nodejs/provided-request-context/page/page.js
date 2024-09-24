import { unstable_after as after } from 'next/server'
import { cliLog } from '../../../../utils/log'

export default function Page() {
  after(() => {
    cliLog({ source: '[page] /provided-request-context/page' })
  })
  return <div>provided-request-context</div>
}
