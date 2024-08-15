import { layoutAction } from './actions'

export default function Layout({ children }) {
  console.log('layout action', layoutAction)
  return (
    <html>
      <body>{children}</body>
    </html>
  )
}
