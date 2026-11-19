import { connection } from 'next/server'

export const instant = false

export default async function ItemModal({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await connection()
  const { id } = await params
  return (
    <dialog id="modal-dialog" open>
      Item {id} (modal)
    </dialog>
  )
}
