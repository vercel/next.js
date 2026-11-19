export default function Root(props: { children: React.ReactNode }) {
  return (
    <html>
      <body>{props.children}</body>
    </html>
  )
}
