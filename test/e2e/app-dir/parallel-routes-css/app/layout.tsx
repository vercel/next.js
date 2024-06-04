import { ReactNode } from 'react'

const RootLayout = ({
  children,
  foo,
}: {
  children: ReactNode
  foo: ReactNode
}) => {
  return (
    <html lang="en">
      <body>
        {children}
        {foo}
      </body>
    </html>
  )
}

export default RootLayout
