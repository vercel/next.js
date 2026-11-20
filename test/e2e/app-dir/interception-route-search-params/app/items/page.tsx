import { Suspense } from 'react'
import { DialogLinks } from '../dialog-links'

export default function Page() {
  return (
    <Suspense>
      <DialogLinks basePath="/items" />
    </Suspense>
  )
}
