'use client'

import { useParams } from 'next/navigation'

export default function Page() {
  const { itemId } = useParams<{ itemId: string }>()

  return <p id="item-id">{itemId}</p>
}
