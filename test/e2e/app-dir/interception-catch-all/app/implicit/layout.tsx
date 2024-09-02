export default function RootLayout({
  children,
  modal,
}: Readonly<{
  children: React.ReactNode
  modal: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body>
        <section>
          <h2>Children</h2>
          <div id="children">{children}</div>
        </section>
        <section>
          <h2>Modal</h2>
          <div id="modal">{modal}</div>
        </section>
      </body>
    </html>
  )
}
