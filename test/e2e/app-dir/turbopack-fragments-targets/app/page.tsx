import { feature0 } from '../lib/features'
import Client from './client'

export default function Page() {
  return (
    <>
      <p>{feature0(0)}</p>
      <Client />
    </>
  )
}
