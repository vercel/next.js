export default function Root(props: LayoutProps<'/'>) {
  return (
    <html>
      <body>{props.children}</body>
    </html>
  )
}
