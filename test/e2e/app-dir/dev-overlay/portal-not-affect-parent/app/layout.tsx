import { ReactNode } from 'react'
export default function Root({ children }: { children: ReactNode }) {
  return (
    <html>
      <body
        style={{
          margin: 0,
          padding: 0,
          width: 300,
          display: 'flex',
          justifyContent: 'space-between',
        }}
      >
        {children}
      </body>
    </html>
  )
}
