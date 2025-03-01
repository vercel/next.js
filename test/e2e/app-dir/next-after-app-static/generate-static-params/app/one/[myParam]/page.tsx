import * as React from 'react'
import { after } from 'next/server'
import { cliLog } from '../../../utils/log'

export function generateStaticParams() {
  after(() => {
    cliLog({ source: '[generateStaticParams] /one/[myParam]' })
  })
  return [{ myParam: 'a' }, { myParam: 'b' }, { myParam: 'c' }]
}

export default async function Page(props) {
  const params = await props.params
  return <div>Param: {params.myParam}</div>
}
