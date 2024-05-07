'use client'

import { unstable_after as after } from 'next/server'
import { cliLog } from '../../utils/log-cli'

export const dynamic = 'force-dynamic'

export default function Page() {
  after(() => {
    cliLog({ source: '[page] /invalid-in-client' })
  })
  return <div>Invalid: Client page with after()</div>
}
