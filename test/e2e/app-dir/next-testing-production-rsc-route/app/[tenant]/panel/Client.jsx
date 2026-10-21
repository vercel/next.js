'use client'
import { useContext } from 'react'
import { Scope } from '../provider'
export default function Client({ request }) {
  return (
    <b data-parallel-client={request} data-provider-context={useContext(Scope)}>
      client
    </b>
  )
}
