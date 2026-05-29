'use client'
import { useParams } from 'next/navigation'

export default function Page() {
  return <div id="bar">{JSON.stringify(useParams())}</div>
}
