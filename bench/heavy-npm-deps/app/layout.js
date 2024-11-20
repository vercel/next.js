import { Component } from '../components/big'

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        <Component />
        {children}
      </body>
    </html>
  )
}
