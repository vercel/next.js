import { Suspense } from 'react'
import DynamicWrapper from './dynamic-wrapper'
import { SimpleWrapper } from './simple-wrapper'

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <SimpleWrapper>
      <Suspense>
        <html>
          <body>
            <DynamicWrapper>{children}</DynamicWrapper>
          </body>
        </html>
      </Suspense>
    </SimpleWrapper>
  )
}
