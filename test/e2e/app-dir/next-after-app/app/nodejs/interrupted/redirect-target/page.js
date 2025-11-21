import { after } from 'next/server'
import { cliLog } from '../../../../utils/log'

export default function Page() {
  after(() => {
    cliLog({
      source: '[page] /interrupted/redirect-target',
    })
  })
  return <div>Redirect</div>
}
