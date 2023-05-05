import { font } from './font'

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <p className={font.className}>LAYOUT1</p>
        {children}
      </body>
    </html>
  )
}
