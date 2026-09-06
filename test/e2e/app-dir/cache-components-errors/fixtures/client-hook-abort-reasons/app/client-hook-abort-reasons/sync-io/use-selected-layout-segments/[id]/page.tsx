import { SyncIO, UseSelectedLayoutSegments } from '../../../client'
import { DataSlot } from '../../../data'

export default function Page() {
  return (
    <>
      <DataSlot />
      <SyncIO />
      <UseSelectedLayoutSegments />
    </>
  )
}
