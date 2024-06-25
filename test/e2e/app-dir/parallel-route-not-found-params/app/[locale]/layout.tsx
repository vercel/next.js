export default function Layout(props: {
  children: React.ReactNode
  params: { locale: string }
  modal: React.ReactNode
}) {
  return (
    <html>
      <body>
        <div id="children">{props.children}</div>
        <div>Locale: {props.params.locale}</div>
        {props.modal}
      </body>
    </html>
  )
}
