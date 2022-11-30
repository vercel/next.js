import { useRouter as usePagesRouter } from 'next/compat/router'
import {
  usePathname,
  useRouter as useAppRouter,
  useSearchParams,
} from 'next/compat/navigation'
import { useState, useEffect, useMemo } from 'react'

export const RouterHooksFixtures = () => {
  const pagesRouter = usePagesRouter()
  const appRouter = useAppRouter()
  const searchParams = useSearchParams()
  const pathname = usePathname()

  const isReady = useMemo(
    () => !pagesRouter || pagesRouter.isReady,
    [pagesRouter]
  )

  const [value, setValue] = useState(null)
  useEffect(() => {
    if (!isReady) {
      return
    }

    setValue(searchParams?.get('key') ?? null)
  }, [isReady, searchParams])

  const onClick = () => {
    appRouter.push('/compat-hooks/pushed')
  }

  return (
    <div id={isReady ? 'router-ready' : 'router-not-ready'}>
      <div id="key-value">{value}</div>
      <div id="pathname">{pathname}</div>
      <button type="button" onClick={onClick}>
        Push
      </button>
    </div>
  )
}
