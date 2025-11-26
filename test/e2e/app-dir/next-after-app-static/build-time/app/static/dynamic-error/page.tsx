import * as React from 'react'
import { after } from 'next/server'
import { cliLog } from '../../../utils/log'

export const dynamic = 'error'

export default function Index() {
  after(async () => {
    cliLog({ source: '[page] /static/dynamic-error' })
  })
  return <div>Page with after()</div>
}
