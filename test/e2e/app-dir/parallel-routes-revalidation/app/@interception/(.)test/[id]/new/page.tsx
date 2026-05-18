import { updateTag } from 'next/cache'

async function updateTagAction() {
  'use server'
  updateTag('test-tag')
}

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  return (
    <div id="test-id-new-modal">
      <h3>Test {id} New Modal</h3>
      <form action={updateTagAction}>
        <button id="update-tag">Update Tag</button>
      </form>
    </div>
  )
}
