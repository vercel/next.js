'use client'

import { useRouter } from 'next/navigation'

export default function ButtonWithRouterAction({
  action,
  href,
  intercept,
  ...props
}: {
  action: 'push' | 'replace'
  href: string
  intercept?: boolean
} & React.HTMLAttributes<HTMLButtonElement>) {
  const router = useRouter()

  return (
    <button
      onClick={() => {
        router[action](href, {
          intercept,
        })
      }}
      {...props}
    />
  )
}
