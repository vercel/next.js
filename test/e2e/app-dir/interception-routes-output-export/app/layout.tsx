export default function Layout(props: {
  children: React.ReactNode
  modal: React.ReactNode
}) {
  return (
    <html>
      <body>
        <div id="children">{props.children}</div>
        <div id="modal">{props.modal}</div>
      </body>
    </html>
  )
}
