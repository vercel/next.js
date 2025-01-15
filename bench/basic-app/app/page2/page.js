import { SharedClienta } from '../shared-client-a'
import { SharedClientb } from '../shared-client-b'
import { RSC } from '../shared-rsc'

export default function Page() {
  return (
    <div>
      My Page 1
      <SharedClienta />
      <SharedClientb />
      <RSC />
    </div>
  )
}
