'use client'
import { useParams } from 'next/navigation'
export default function Page() {
  const params = useParams()
  if (params === null) {
    return null
  }
  return (
    <div>
      <div id="param-id">{params.id}</div>
      <div id="param-id2">{params.id2}</div>
    </div>
  )
}
