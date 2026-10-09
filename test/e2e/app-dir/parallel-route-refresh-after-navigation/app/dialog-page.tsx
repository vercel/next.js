import { Suspense } from 'react'
import { connection } from 'next/server'
import { Dialog } from './dialog'

type DialogPageProps = {
  searchParams: Promise<{ closePath?: string }>
}

export function createDialogPage(kind: 'edit' | 'result') {
  async function DialogContent({ searchParams }: DialogPageProps) {
    await connection()
    const { closePath = '/home' } = await searchParams
    return <Dialog kind={kind} closePath={closePath} />
  }

  return function DialogPage(props: DialogPageProps) {
    return (
      <Suspense fallback={null}>
        <DialogContent {...props} />
      </Suspense>
    )
  }
}
