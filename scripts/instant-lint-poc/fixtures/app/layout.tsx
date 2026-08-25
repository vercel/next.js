// Expect: INSTANT — a static root layout. Note: a <Suspense> placed here
// would NOT protect child segments during client navigations (an
// already-mounted layout's boundaries are revealed and don't cover new
// content below), which is why each segment is analyzed on its own.
export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
