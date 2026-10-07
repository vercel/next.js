export const unstable_instant = false

export default async function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html>
      <body>
        <p>
          This root layout has <code>instant = false</code> and no suspense
          boundaries.
        </p>
        <hr />
        {children}
      </body>
    </html>
  )
}
