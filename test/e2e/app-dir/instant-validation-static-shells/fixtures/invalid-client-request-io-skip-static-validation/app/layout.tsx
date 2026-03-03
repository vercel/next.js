export default async function RootLayout({ children }) {
  return (
    <html>
      <body>{children}</body>
    </html>
  )
}

export const unstable_instant = false
