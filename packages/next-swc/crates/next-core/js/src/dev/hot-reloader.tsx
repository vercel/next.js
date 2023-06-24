'use client'

import type React from 'react'
import { useRouter, usePathname } from 'next/dist/client/components/navigation'
import { useEffect } from 'react'
import { subscribeToUpdate } from '@vercel/turbopack-ecmascript-runtime/dev/client/hmr-client'
import { ReactDevOverlay } from './client'
import { NotFoundBoundary } from 'next/dist/client/components/not-found-boundary'

type HotReloadProps = React.PropsWithChildren<{
  assetPrefix?: string
  notFound?: React.ReactNode
  notFoundStyles?: React.ReactNode
  asNotFound?: boolean
}>

export default function HotReload({
  assetPrefix,
  children,
  notFound,
  notFoundStyles,
  asNotFound,
}: HotReloadProps) {
  const router = useRouter()
  const path = usePathname()!.slice(1)

  useEffect(() => {
    const unsubscribe = subscribeToUpdate(
      {
        path,
        headers: {
          rsc: '1',
        },
      },
      (update) => {
        if (update.type !== 'issues') {
          router.refresh()
        }
      }
    )
    return unsubscribe
  }, [router, path])

  return (
    <NotFoundBoundary
      key={asNotFound + ''}
      notFound={notFound}
      notFoundStyles={notFoundStyles}
      asNotFound={asNotFound}
    >
      <ReactDevOverlay globalOverlay={true}>{children}</ReactDevOverlay>
    </NotFoundBoundary>
  )
}
