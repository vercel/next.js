export default function Layout({ children }: any) {
  return (
    <html
      style={{
        overflowY: 'scroll',
      }}
    >
      <head />
      <body style={{ margin: 0 }}>{children}</body>
    </html>
  )
}
