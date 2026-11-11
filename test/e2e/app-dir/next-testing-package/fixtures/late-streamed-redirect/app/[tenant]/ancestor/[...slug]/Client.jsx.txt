'use client'

import { useContext } from 'react'
import { Scope } from '../../provider'

export default function Client({ request }) {
  const tenant = useContext(Scope)
  return (
    <span id="ancestor-client" data-provider-context={tenant}>
      {request}
    </span>
  )
}
