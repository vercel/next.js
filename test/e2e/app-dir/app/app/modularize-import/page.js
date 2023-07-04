import { AlarmCheckIcon } from 'lucide-react'
import { XOctagon, PinOffIcon, Package2Icon } from 'lucide-react'

import Component, { KeyRoundIcon } from './component'

export default function Page() {
  return (
    <div>
      <p>Modularized Import</p>
      <AlarmCheckIcon />
      <XOctagon />
      <PinOffIcon />
      <Package2Icon />
      <hr />
      <Component />
      <KeyRoundIcon />
    </div>
  )
}
