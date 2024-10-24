import { ClientValue } from './client-component'

declare const MY_MAGIC_VARIABLE: string

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
