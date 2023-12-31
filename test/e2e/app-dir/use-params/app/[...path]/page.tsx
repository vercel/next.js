'use client'
import { useParams } from 'next/navigation'
export default function Page() {
  const params = useParams()
  if (params === null) {
    return null
  }
  return (
    <div>
      <div id="params">{JSON.stringify(params.path)}</div>
    </div>
  )
}
