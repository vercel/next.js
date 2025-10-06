import * as React from 'react'
import { after } from 'next/server'
import { cliLog } from '../../../utils/log'

export function generateStaticParams() {
  after(() => {
    cliLog({ source: '[generateStaticParams] /two/[myParam]' })
  })
  return [{ myParam: 'd' }, { myParam: 'e' }, { myParam: 'f' }]
}

export default async function Page(props) {
  const params = await props.params
  return <div>Param: {params.myParam}</div>
}
