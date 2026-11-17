'use client'

import { useParams } from 'next/navigation'

export function Params() {
  const { category, item } = useParams()
  return <p id="client-params">{category + '/' + item}</p>
}
