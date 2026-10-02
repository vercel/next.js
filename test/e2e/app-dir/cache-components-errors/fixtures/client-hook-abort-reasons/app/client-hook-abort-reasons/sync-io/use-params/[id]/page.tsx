import { SyncIO, UseParams } from '../../../client'
import { DataSlot } from '../../../data'

export default function Page() {
  return (
    <>
      <UseParams />
      <SyncIO />
      <DataSlot />
    </>
  )
}
