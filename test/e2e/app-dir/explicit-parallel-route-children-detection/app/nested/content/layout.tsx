import type { ReactNode } from 'react'

export default function Layout({
  left,
  right,
}: {
  left: ReactNode
  right: ReactNode
}) {
  return (
    <section>
      {left}
      {right}
    </section>
  )
}
