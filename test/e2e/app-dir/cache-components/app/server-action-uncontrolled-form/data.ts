import { io } from 'next/cache'

const post = { title: 'Post 1 v1' }

export async function getPost() {
  await io()
  return post
}

export function updatePost(title: string) {
  post.title = title
}
