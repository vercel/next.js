'use client'
import { useParams } from 'next/navigation'

export default function Page() {
  return <div id="foo">{JSON.stringify(useParams())}</div>
}
