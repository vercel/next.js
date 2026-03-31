'use client'
import { use } from 'react'

import { useSearchParams } from 'next/navigation'
import dynamic from 'next/dynamic'

const Button = dynamic(() =>
  import('../../../../components/button/button').then((mod) => mod.Button)
)

export default function IdPage(props) {
  const params = use(props.params)

  const { children } = props

  return (
    <>
      <p>
        Id Page. Params:{' '}
        <span id="id-page-params">{JSON.stringify(params)}</span>
      </p>
      {children}

      <p id="search-params">
        {JSON.stringify(Object.fromEntries(useSearchParams()))}
      </p>
      <Button>button on app/dynamic-client</Button>
    </>
  )
}
