'use client'
import { useParams } from 'next/navigation'
export default function Page() {
  const { id } = useParams()
  return (
    <div>
      <div id="param-id">{id}</div>
    </div>
  )
}
