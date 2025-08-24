import { notFound } from 'next/navigation'
import { after, connection } from 'next/server'
import { cliLog } from '../../../../utils/log'

export default async function Page() {
  await connection()
  after(() => {
    cliLog({
      source: '[page] /interrupted/calls-not-found',
    })
  })
  notFound()
}
