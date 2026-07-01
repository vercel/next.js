// Dynamic so the stamp changes whenever the router refreshes. Navigations
// preserve the root layout, so a changed stamp means a refresh happened.
export const dynamic = 'force-dynamic'

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>
        <div data-testid="stamp">{Date.now()}</div>
        {children}
      </body>
    </html>
  )
}
