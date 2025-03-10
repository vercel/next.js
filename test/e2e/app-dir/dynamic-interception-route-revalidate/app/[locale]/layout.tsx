import React from 'react'

export default function Root({
  children,
  modal,
}: {
  children: React.ReactNode
  modal: React.ReactNode
}) {
  return (
    <html>
      <body>
        {children}
        {modal}
      </body>
    </html>
  )
}

export const revalidate = 0
export async function generateStaticParams() {
  return [{ locale: 'en' }]
}
