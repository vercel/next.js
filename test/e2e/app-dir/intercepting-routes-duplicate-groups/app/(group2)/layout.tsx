import { ReactNode } from 'react'
export default function Group2Layout({
  children,
  modal,
}: {
  children: ReactNode
  modal: ReactNode
}) {
  return (
    <>
      <div id="group2-children">{children}</div>
      <div id="group2-modal">{modal}</div>
    </>
  )
}
