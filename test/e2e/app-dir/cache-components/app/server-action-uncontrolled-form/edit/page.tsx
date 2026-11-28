import { refresh } from 'next/cache'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import { getPost, updatePost } from '../data'

export default function Page() {
  return (
    <Suspense fallback="Loading...">
      <EditPost />
    </Suspense>
  )
}

async function EditPost() {
  const post = await getPost()

  async function savePost(formData: FormData) {
    'use server'

    updatePost(String(formData.get('title')))
    refresh()
    redirect('/server-action-uncontrolled-form')
  }

  return (
    <form action={savePost}>
      <input data-testid="title-input" name="title" defaultValue={post.title} />
      <button data-testid="save-post" type="submit">
        Save
      </button>
    </form>
  )
}
