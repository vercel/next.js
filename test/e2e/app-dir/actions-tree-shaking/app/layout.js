import { action } from './actions'

export default function Layout({ children }) {
  console.log('layout action', action)
  return (
    <html>
      <body>{children}</body>
    
    </html>
  )
}
