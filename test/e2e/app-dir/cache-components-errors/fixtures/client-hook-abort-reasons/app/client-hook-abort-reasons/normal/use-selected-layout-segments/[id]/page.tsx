import { UseSelectedLayoutSegments } from '../../../client'
import { DataSlot } from '../../../data'

export default function Page() {
  return (
    <>
      <UseSelectedLayoutSegments />
      <DataSlot />
    </>
  )
}
