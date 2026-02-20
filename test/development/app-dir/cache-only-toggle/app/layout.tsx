import { ReactNode } from 'react'
export default function Root({ children }: { children: ReactNode }) {
  return (
    <html>
      <body
        style={{
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
          maxWidth: 640,
          margin: '0 auto',
          padding: '2rem 1rem',
          lineHeight: 1.6,
          color: '#111',
        }}
      >
        {children}
      </body>
    </html>
  )
}
