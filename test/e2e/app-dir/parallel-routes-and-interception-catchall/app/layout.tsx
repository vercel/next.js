import React from 'react'

export default function RootLayout({
  children,
  modal,
  slot,
}: Readonly<{
  children: React.ReactNode
  modal: React.ReactNode
  slot: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body>
        <section>
          <h1>Children</h1>
          <div id="children-slot">{children}</div>
        </section>
        <section>
          <h1>Modal</h1>
          <div id="modal-slot">{modal}</div>
        </section>
        <section>
          <h1>Slot</h1>
          <div id="slot-slot">{slot}</div>
        </section>
      </body>
    </html>
  )
}
