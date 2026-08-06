export default function Root({ children }: { children: React.ReactNode }) {
  return (
    <html>
      <body
        style={{
          backgroundColor: 'black',
          color: 'white',
        }}
      >
        {children}
      </body>
    </html>
  )
}
