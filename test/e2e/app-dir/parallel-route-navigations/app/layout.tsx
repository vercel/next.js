import './layout.css'

export default function Layout(props: { children: React.ReactNode }) {
  return (
    <html>
      <body>{props.children}</body>
    </html>
  )
}
