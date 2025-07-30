import { Suspense } from 'react'

export default function Root(props: LayoutProps<'/'>) {
  return (
    <html>
      <body>
        <Suspense>{props.children}</Suspense>
      </body>
    </html>
  )
}
