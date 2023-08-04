import type { ReactNode } from 'react'
import { useEffect, useCallback } from 'react'
import DefaultHeader from './DefaultHeader'
import CommonFooter from '@/layouts/common/CommonFooter'

import { useRouter } from 'next/router'

type Props = {
  children: ReactNode
}

const mainContentId = 'defaultMainContent'

export default function DefaultLayout({ children }: Props) {
  const router = useRouter()

  const resetWindowScrollPosition = useCallback(() => {
    const element = document.getElementById(mainContentId)
    if (element) {
      element.scrollIntoView({ block: 'start' })
    }
  }, [])
  useEffect(() => {
    ;(async () => {
      await new Promise((resolve) => setTimeout(resolve, 100))
      if (!router.asPath.includes('#')) {
        resetWindowScrollPosition()
      }
    })()
  }, [router.asPath, resetWindowScrollPosition])

  return (
    <>
      <div className="relative h-full w-full bg-white dark:bg-gray-900">
        <DefaultHeader />
        <div id={mainContentId} className="min-h-screen">
          {children}
        </div>
        <CommonFooter />
      </div>
    </>
  )
}
