export default function Layout({
  children,
  foo,
}: {
  children: React.ReactNode
  foo: boolean
}) {
  return (
    <html>
      <body>
        {children}
        {process.env.NEXT_PUBLIC_RENDER_PARALLEL_SLOT ? foo : null}
      </body>
    </html>
  )
}
