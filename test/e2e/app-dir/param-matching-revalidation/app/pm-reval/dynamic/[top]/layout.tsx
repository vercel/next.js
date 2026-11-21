import type { ReactNode } from 'react'
import { getStamp } from '../../../stamp'

export default async function Layout({
  children,
  params,
}: {
  children: ReactNode
  params: Promise<{ top: string }>
}) {
  const { top } = await params
  return (
    <main>
      <p id="stamp">{await getStamp('dynamic', top)}</p>
      {children}
    </main>
  )
}
