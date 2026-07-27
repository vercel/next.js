'use client'
import { usePathname, useSearchParams } from 'next/navigation'

export default function Page() {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  return (
    <>
      <p id="pathname">{pathname}</p>
      <p id="slug">{searchParams.get('slug')}</p>
    </>
  )
}
