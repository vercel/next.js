import { RouterAct } from '@next/router-act/component'

export default function RootLayout({ children, params }) {
  return (
    <html lang="en">
      <body>
        <RouterAct />
        {children}
      </body>
    </html>
  )
}
