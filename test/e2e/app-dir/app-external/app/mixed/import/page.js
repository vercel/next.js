import { value } from 'mixed-syntax-esm'
import { Client } from './client'
import { value as relativeMixedValue } from './mixed-mod.mjs'

export default function Page() {
  return (
    <>
      <p id="server">{'server:' + value}</p>
      <p id="client">
        <Client />
      </p>
      <p id="relative-mixed">{relativeMixedValue}</p>
    </>
  )
}
