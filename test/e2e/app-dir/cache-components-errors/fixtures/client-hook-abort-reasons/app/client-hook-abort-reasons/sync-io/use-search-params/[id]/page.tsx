import { SyncIO, UseSearchParams } from '../../../client'
import { DataSlot } from '../../../data'

export default function Page() {
  return (
    <>
      <SyncIO />
      <UseSearchParams />
      <DataSlot />
    </>
  )
}
