'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'

export default function ItemPage() {
  const { itemId } = useParams<{ itemId: string }>()
  return (
    <>
      <p id="item-id">{itemId}</p>
      <Link id="next-item" href="/items/second%20id" prefetch={false}>
        Next item
      </Link>
    </>
  )
}
