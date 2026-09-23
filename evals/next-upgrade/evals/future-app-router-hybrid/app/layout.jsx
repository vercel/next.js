import { AppProvider } from '../components/AppProvider'
import '../styles/globals.css'

export default function Layout({ children }) {
  return (
    <html lang="en">
      <body>
        <AppProvider>{children}</AppProvider>
      </body>
    </html>
  )
}
