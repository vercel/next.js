// The barrel file shouldn't be transformed many times if it's imported multiple times.

import { ImageIcon } from 'lucide-react'
import { IceCream } from 'lucide-react'
import { AccessibilityIcon } from 'lucide-react'
import { VariableIcon } from 'lucide-react'
import { Table2Icon } from 'lucide-react'
import { Package2Icon } from 'lucide-react'
import { ZapIcon } from 'lucide-react'

export default function Page() {
  return (
    <>
      <ImageIcon />
      <IceCream />
      <AccessibilityIcon />
      <VariableIcon />
      <Table2Icon />
      <Package2Icon />
      <ZapIcon />
    </>
  )
}
