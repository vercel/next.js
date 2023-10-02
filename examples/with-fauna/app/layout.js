import './globals.css'

export const metadata = {
  title: 'Next.js + Fauna example',
  description: 'Generated by Next.js',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
