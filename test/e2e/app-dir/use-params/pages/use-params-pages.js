'use client'
import { useParams } from 'next/navigation'
export default function Page() {
  const params = useParams()
  return (
    <div>
      <div id="params">{JSON.stringify(params)}</div>
    </div>
  )
}
