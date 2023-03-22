'use client'
import { useParams } from 'next/navigation'
export default function Page() {
  const { id, id2 } = useParams()
  return (
    <div>
      <div id="param-id">{id}</div>
      <div id="param-id2">{id2}</div>
    </div>
  )
}
