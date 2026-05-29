import { after, connection } from 'next/server'
import { cliLog } from '../../../../utils/log'

export default async function Page() {
  await connection()
  after(() => {
    cliLog({
      source: '[page] /interrupted/throws-error',
    })
  })
  throw new Error('User error')
}
