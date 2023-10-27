'use client'
import { usePathname } from 'next/navigation'

export const dynamicParams = false

export default function Page() {
  const pathname = usePathname()

  return <p id="pathname">{pathname}</p>
}
