/* eslint-disable no-undef */
import { ClientValue } from './client-component'

export default function Page() {
  return (
    <ul>
      <li>
        Server value:{' '}
        {typeof MY_MAGIC_VARIABLE === 'string' ? MY_MAGIC_VARIABLE : 'not set'}
      </li>
      <li>
        Client value: <ClientValue />
      </li>
    </ul>
  )
}
