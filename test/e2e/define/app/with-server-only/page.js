/* eslint-disable no-undef */
import { ClientValue, ClientExpr } from './client-component'

export default function Page() {
  return (
    <ul>
      <li>
        Server value:{' '}
        {typeof MY_SERVER_VARIABLE === 'string'
          ? MY_SERVER_VARIABLE
          : 'not set'}
      </li>
      <li>
        Client value: <ClientValue />
      </li>
      <li>
        Server expr:{' '}
        {typeof process.env.MY_MAGIC_SERVER_EXPR === 'string'
          ? process.env.MY_MAGIC_SERVER_EXPR
          : 'not set'}
      </li>
      <li>
        Client expr: <ClientExpr />
      </li>
    </ul>
  )
}
