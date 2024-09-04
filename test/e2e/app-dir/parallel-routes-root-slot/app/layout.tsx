export default function Layout({
  children,
  slot,
}: {
  children: React.ReactNode
  slot: React.ReactNode
}) {
  return (
    <html>
      <body>
        {children}
        {slot}
      </body>
    </html>
  )
}
