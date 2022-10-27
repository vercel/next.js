import { useRouter } from 'next/router'
import { usePathname, useSearchParams } from 'next/navigation'
import { useState } from 'react'
import { useEffect } from 'react'

export const RouterHooksFixtures = () => {
  const router = useRouter()
  const searchParams = useSearchParams()
  const pathname = usePathname()

  const [value, setValue] = useState(null)
  useEffect(() => {
    if (!router.isReady) {
      return
    }

    setValue(searchParams.get('key'))
  }, [router.isReady, searchParams])

  return (
    <div id={router.isReady ? 'router-ready' : 'router-not-ready'}>
      <div id="key-value">{value}</div>
      <div id="pathname">{pathname}</div>
    </div>
  )
}
