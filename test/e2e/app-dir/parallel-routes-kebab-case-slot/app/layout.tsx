export default function Layout({
  children,
  ...parallelRoutes
}: {
  children: React.ReactNode
  'slot-name': React.ReactNode
}) {
  return (
    <html>
      <body>
        {children}
        {parallelRoutes['slot-name']}
      </body>
    </html>
  )
}
