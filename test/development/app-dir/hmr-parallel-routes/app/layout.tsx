import { ReactNode } from 'react'

function Layout(props: { foo: ReactNode; bar: ReactNode }) {
  return (
    <html>
      <body>
        {props.foo}
        {props.bar}
      </body>
    </html>
  )
}

export default Layout
