import { Inter } from 'next/font/google'
import '../global.css'

const interFont = Inter({
  subsets: ['latin'],
})

export default function Layout({ children }) {
  return (
    <html>
      <head />
      <body className={interFont.className}>{children}</body>
    </html>
  )
}
