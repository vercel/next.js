export default function layout({ children }) {
  return (
    <html>
      <body>{children}</body>
    </html>
  )
}

export const runtime = 'edge'
