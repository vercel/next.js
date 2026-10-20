import { refresh } from 'next/cache'
import Link from 'next/link'
import { Suspense } from 'react'
import { getPost, updatePost } from './data'

export default function Page() {
  return (
    <Suspense fallback="Loading...">
      <Post />
    </Suspense>
  )
}

async function Post() {
  const post = await getPost()

  async function savePost(formData: FormData) {
    'use server'

    updatePost(String(formData.get('title')))
    refresh()
  }

  return (
    <>
      <h1 data-testid="post-title">{post.title}</h1>
      <Link href="/server-action-uncontrolled-form/edit">Edit post</Link>
      <form action={savePost}>
        <input
          data-testid="inline-title-input"
          name="title"
          defaultValue={post.title}
        />
        <button data-testid="save-inline-post" type="submit">
          Save
        </button>
      </form>
    </>
  )
}
