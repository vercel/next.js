import { UsePathname } from '../../../client'
import { DataSlot } from '../../../data'

export default function Page() {
  return (
    <>
      <UsePathname />
      <DataSlot />
    </>
  )
}
