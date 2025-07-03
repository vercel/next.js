import React from 'react'

export default function RootLayout(props: LayoutProps<'/'>) {
  return (
    <html>
      <body>
        <h1>Root Layout</h1>
        {props.children}
      </body>
    </html>
  )
}
