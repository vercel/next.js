import { ReactNode } from 'react'
export default function Group1Layout({
  children,
  modal,
}: {
  children: ReactNode
  modal: ReactNode
}) {
  return (
    <>
      <div id="group1-children">{children}</div>
      <div id="group1-modal">{modal}</div>
    </>
  )
}
