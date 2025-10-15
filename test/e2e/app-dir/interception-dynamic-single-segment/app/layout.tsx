import { Suspense } from 'react'

export default function Layout(props: {
  children: React.ReactNode
  modal: React.ReactNode
}) {
  return (
    <Suspense>
      <html>
        <body>
          <div id="children">{props.children}</div>
          <div id="modal">{props.modal}</div>
        </body>
      </html>
    </Suspense>
  )
}
