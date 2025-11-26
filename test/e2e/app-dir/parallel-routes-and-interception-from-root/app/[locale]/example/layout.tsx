import { ReactNode } from 'react'

export default function Layout({
  children,
  modal,
}: {
  children: ReactNode
  modal: ReactNode
}) {
  return (
    <div>
      {children}
      {modal}
    </div>
  )
}
