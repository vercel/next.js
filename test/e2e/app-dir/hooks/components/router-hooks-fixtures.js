import { useRouter as usePagesRouter } from 'next/router'
import {
  usePathname,
  useRouter as useAppRouter,
  useSearchParams,
} from 'next/navigation'
import { useState, useEffect } from 'react'

export const RouterHooksFixtures = () => {
  const pagesRouter = usePagesRouter()
  const appRouter = useAppRouter()
  const searchParams = useSearchParams()
  const pathname = usePathname()

  const [value, setValue] = useState(null)
  useEffect(() => {
    if (!pagesRouter.isReady) {
      return
    }

    setValue(searchParams.get('key'))
  }, [pagesRouter.isReady, searchParams])

  const onClick = () => {
    appRouter.push('/adapter-hooks/pushed')
  }

  return (
    <div id={pagesRouter.isReady ? 'router-ready' : 'router-not-ready'}>
      <div id="key-value">Value:{value}</div>
      <div id="pathname">{pathname}</div>
      <button type="button" onClick={onClick}>
        Push
      </button>
    </div>
  )
}
