import { value } from 'mixed-syntax-esm'
import { Client } from './client'

export default function Page() {
  return (
    <>
      <p id="server">{'server:' + value}</p>
      <p id="client">
        <Client />
      </p>
    </>
  )
}
