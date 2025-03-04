'use client'

import { useTransition } from 'react'
import Link from 'next/link'

export function NavigateToSlow() {
  const [isPending, startTransition] = useTransition()

  return (
    <Link
      id="navigate-to-slow"
      href="/linking/slow"
      withNavigateFn={(navigateFn) =>
        startTransition(() => {
          navigateFn()
        })
      }
    >
      Load Slow Page {isPending ? '(Loading...)' : null}
    </Link>
  )
}
