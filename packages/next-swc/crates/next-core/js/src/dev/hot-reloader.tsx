'use client'

import type React from 'react'
import { useRouter, usePathname } from 'next/dist/client/components/navigation'
import { useEffect } from 'react'
import { subscribeToUpdate } from '@vercel/turbopack-dev/client/hmr-client'
import { ReactDevOverlay } from './client'

type HotReloadProps = React.PropsWithChildren<{
  assetPrefix?: string
}>

export default function HotReload({ assetPrefix, children }: HotReloadProps) {
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

  return <ReactDevOverlay globalOverlay={true}>{children}</ReactDevOverlay>
}
