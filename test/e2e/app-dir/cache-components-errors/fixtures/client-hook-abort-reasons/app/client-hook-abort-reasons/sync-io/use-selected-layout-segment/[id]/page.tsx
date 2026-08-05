import { SyncIO, UseSelectedLayoutSegment } from '../../../client'
import { DataSlot } from '../../../data'

export default function Page() {
  return (
    <>
      <DataSlot />
      <UseSelectedLayoutSegment />
      <SyncIO />
    </>
  )
}
