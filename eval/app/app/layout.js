export const metadata = {
  title: 'Eval App',
  description: 'Curl-hint eval fixture',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
