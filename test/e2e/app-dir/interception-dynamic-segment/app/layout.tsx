import { RouterAct } from '@next/router-act/component'

export default function Layout(props: {
  children: React.ReactNode
  modal: React.ReactNode
}) {
  return (
    <html>
      <body>
        <RouterAct />
        <div id="children">
          <div>CHILDREN SLOT:</div>
          {props.children}
        </div>
        <div id="modal">
          <div>MODAL SLOT:</div>
          {props.modal}
        </div>
      </body>
    </html>
  )
}
