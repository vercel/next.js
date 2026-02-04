import { after, connection } from 'next/server'
import { cliLog } from '../../../../utils/log'

export default async function Page() {
  await connection()
  after(() => {
    cliLog({ source: '[page] /provided-request-context/page' })
  })
  return <div>provided-request-context</div>
}
