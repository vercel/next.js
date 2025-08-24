'use client'

export default function Root({ children }: { children: React.ReactNode }) {
  return (
    <html className="layout-cls">
      <body className="body-cls">{children}</body>
    </html>
  )
}
