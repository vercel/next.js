'use client'
import { useSearchParams } from 'next/navigation'

export default function UseSearchParams() {
  const params = useSearchParams()

  return (
    <>
      <p id="params-first">{params.get('first') ?? 'N/A'}</p>
      <p id="params-second">{params.get('second') ?? 'N/A'}</p>
      <p id="params-third">{params.get('third') ?? 'N/A'}</p>
      <p id="params-not-real">{params.get('notReal') ?? 'N/A'}</p>
    </>
  )
}
